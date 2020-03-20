#include <Wire.h>    // Required for I2C communication
#include <PCF8574.h>
//#include <PCint.h>

/** PCF8574 instance */
PCF8574 expanders[2];

#define TRUE 1
#define FALSE 0

/* Data pins */
#define dataB0 2
#define dataB1 3
#define dataB2 4
#define dataB3 5
#define dataB4 6
#define dataB5 7
#define dataB6 8
#define dataB7 10

/* Chip control */
#define chipEnable A3
#define outputEnable A0 // Was A4
#define powerEnable A1 // For 27C16 and 27C32 // Was A5
#define readVoltageEnable 13 // For 27C16
#define programVoltageEnableC16 9 // For 27C16
#define programVoltageEnableC32 12 // For 27C32 and 27C512
#define programVoltageEnableOther 11 // For other

/* Voltage control (for programming chips) */
#define voltageControl A6
#define rTop 10000.0
#define rBottom 1500.0

//#define MESSAGES

typedef enum chipType {
  NONE = 0,
  C16 = 1,
  C32 = 2,
  C64 = 3,
  C128 = 4,
  C256 = 5,
  C512 = 6
} Chip;

typedef enum mode {
  WAIT,
  READ,
  WRITE,
  VOLTAGE
} Modes;


void write_mode (void);
void read_mode (void);
void set_address (uint16_t address);
uint8_t get_data (void);
void set_data (uint8_t data);
uint8_t read_byte (uint16_t address);
void write_byte (uint16_t address, uint8_t data);
float get_voltage (void);
void program_voltage_set (bool state);
void select_chip (chipType new_chip);

chipType chip = NONE;
Modes mode = WAIT;
uint8_t log_enable = TRUE;
uint16_t start_address = 0x0000;
uint16_t end_address = 0x0000;
#define BUF_LEN 16
uint8_t buf[BUF_LEN];
char strbuf[3];

void message(const char* mes){
	if (log_enable)
		Serial.println(mes);
}

void setup() {
  /* Start I2C bus and PCF8574 instance */
  expanders[0].begin(0x38);
  expanders[1].begin(0x39);

  /* Setup PCF8574 pins as outputs */
  for (uint8_t i=0;i<2;i++) {
    for (uint8_t j=0;j<8;j++) {
      expanders[i].pinMode(j, OUTPUT);
      expanders[i].digitalWrite(j, LOW);
    }
  }
    
  // Chip control
  pinMode(chipEnable, OUTPUT);
  pinMode(outputEnable, OUTPUT);
  pinMode(powerEnable, OUTPUT);
  pinMode(readVoltageEnable, OUTPUT);
  pinMode(programVoltageEnableC16, OUTPUT);
  pinMode(programVoltageEnableC32, OUTPUT);
  pinMode(programVoltageEnableOther, OUTPUT);
  digitalWrite(outputEnable, HIGH);
  digitalWrite(powerEnable, HIGH);
  digitalWrite(readVoltageEnable, HIGH);
  digitalWrite(programVoltageEnableC16, LOW);
  digitalWrite(programVoltageEnableC32, LOW);
  digitalWrite(programVoltageEnableOther, LOW);
  digitalWrite(chipEnable, LOW);

  // Data pins
  read_mode();

  Serial.begin(115200);
  Serial.println("Arduino 27 Series EPROM programmer");
}

void loop() {
  switch (mode) {
    case READ:
      if (chip == NONE) {
        mode = WAIT;
        break;
      }
      message("Read mode.");
      read_mode();
      if (chip == C16) digitalWrite(readVoltageEnable, LOW);
      digitalWrite(chipEnable, LOW);
      digitalWrite(outputEnable, LOW);
      for (uint16_t i = start_address; i <= end_address; i++) {
        uint8_t data = read_byte(i);

        //Serial.write(&data, sizeof(data));
        if (i % 32 == 0) Serial.println();
        snprintf(strbuf, sizeof(strbuf), "%02x", data);
        Serial.print(strbuf);
        if (i == end_address) break; // Защита от переполнения uint16
      }
      digitalWrite(outputEnable, HIGH);
      digitalWrite(chipEnable, HIGH);
      if (chip == C16) digitalWrite(readVoltageEnable, HIGH);
      mode = WAIT;
      Serial.println();
      break;
    case WRITE:
      if (chip == NONE) {
        mode = WAIT;
        break;
      }
      message("Write mode");
      /*for (int i = start_address; i <= end_address; i++) {
        Serial.println(i, HEX);
        write_byte(i, 0x89);
        }*/
      for (uint16_t i = start_address; i <= end_address; i += BUF_LEN) {
        Serial.print("Write block ");
        Serial.println(i);
        uint8_t count = Serial.readBytes((char*)buf, BUF_LEN);
        if (count != BUF_LEN) {
          Serial.print("Error on block");
          Serial.println(i);
          Serial.print("Received ");
          Serial.println(count);
          break;
        }
        for (uint16_t j = 0; j < BUF_LEN; j++) {
					// Write byte
					write_mode();
					program_voltage_set(true);
          write_byte((i + j), buf[j]);
					program_voltage_set(false);

					// Verify byte
					read_mode();
					if (chip == C16) digitalWrite(readVoltageEnable, LOW);
					digitalWrite(chipEnable, LOW);
					digitalWrite(outputEnable, LOW);
					uint8_t verify = get_data();
					digitalWrite(outputEnable, HIGH);
					digitalWrite(chipEnable, HIGH);
					if (chip == C16) digitalWrite(readVoltageEnable, HIGH);
					if (buf[j] != verify){
						Serial.print("Error on address ");
						Serial.println(i + j);
						mode = WAIT;
					}
        }
        Serial.print("Complete block ");
        Serial.println(i);
        if (i == end_address) break;
      }
      message("Write success.");
      mode = WAIT;
      break;
    case VOLTAGE:
      Serial.print("Programming voltage: ");
      Serial.println(get_voltage(), 1);
      mode = WAIT;
      break;
    default:
      if (chip == NONE) message("Chip not selected!");
      message("Wait commands...");
      while (Serial.available()) Serial.read();
      do {} while (Serial.available() == 0);
      char incomingByte = Serial.read();
      while (Serial.available()) Serial.read();
      switch (incomingByte) {
        case 'r': mode = READ; break;
        case 'w': mode = WRITE; break;
        case 'v': mode = VOLTAGE; break;
        case 'a': select_chip(C16); break;
        case 'b': select_chip(C32); break;
        case 'c': select_chip(C64); break;
        case 'd': select_chip(C128); break;
        case 'e': select_chip(C256); break;
        case 'f': select_chip(C512); break;
      }
  }
}

void select_chip (chipType new_chip) {
  digitalWrite(powerEnable, HIGH);
  switch (new_chip) {
    case C16:
      digitalWrite(powerEnable, LOW);
      chip = new_chip;
      end_address = 0x07ff;
			message("Select 27C16 chip.");
      break;
    case C32:
      digitalWrite(powerEnable, LOW);
      chip = new_chip;
      end_address = 0x0fff;
			message("Select 27C32 chip.");
      break;
    case C64:
      chip = new_chip;
      end_address = 0x1fff;
			message("Select 27C64 chip.");
      break;
    case C128:
      chip = new_chip;
      end_address = 0x3fff;
			message("Select 27C128 chip.");
      break;
    case C256:
      chip = new_chip;
      end_address = 0x7fff;
			message("Select 27C256 chip.");
      break;
    case C512:
      chip = C512;
      end_address = 0xffff;
			message("Select 27C512 chip.");
      break;
    default:
      chip = NONE;
      end_address = 0x0000;
			message("Chip not selected!");
  }
}

void program_voltage_set (bool state) {
  switch (chip) {
    case C16:
      digitalWrite(programVoltageEnableC16, state);
      break;
    case C32:
    case C512:
      digitalWrite(programVoltageEnableC32, state);
      break;
    case C64:
    case C128:
    case C256:
    default:
      digitalWrite(programVoltageEnableOther, state);
  }
}

void write_mode (void) {
  pinMode(dataB0, OUTPUT);
  pinMode(dataB1, OUTPUT);
  pinMode(dataB2, OUTPUT);
  pinMode(dataB3, OUTPUT);
  pinMode(dataB4, OUTPUT);
  pinMode(dataB5, OUTPUT);
  pinMode(dataB6, OUTPUT);
  pinMode(dataB7, OUTPUT);
}

void read_mode (void) {
  pinMode(dataB0, INPUT_PULLUP);
  pinMode(dataB1, INPUT_PULLUP);
  pinMode(dataB2, INPUT_PULLUP);
  pinMode(dataB3, INPUT_PULLUP);
  pinMode(dataB4, INPUT_PULLUP);
  pinMode(dataB5, INPUT_PULLUP);
  pinMode(dataB6, INPUT_PULLUP);
  pinMode(dataB7, INPUT_PULLUP);
}

uint16_t gen_address (uint16_t address) {
  byte high = highByte(address);
  byte low = lowByte(address);
  switch (chip) {
    case C16:
      break;
      if (mode == READ) {
        high |= 1 << 3; // A11 (C32+) is Vpp for C16 (5v for read)
      }
      break;
    case C64:
    case C128:
      if (mode == READ) {
        high |= 1 << 6; // A14 (C256 and C512) is ~PGM for C64 and C128
      }
      break;
    case C32:
    case C256:
    case C512:
    default:
      break;
  }
  return (high << 8) | low;
}

void set_address (uint16_t address) {
  address = gen_address(address);

  byte registerTwo = highByte(address);
  byte registerOne = lowByte(address);

  //Serial.print("Low address ");
  //Serial.print(registerOne, HEX);
  //Serial.print(" ");

  for (int i=0;i<8;i++) {
    uint8_t value = (registerOne >> i) & 1;

    if (value == 0)
      expanders[0].digitalWrite(i, LOW);
    else
      expanders[0].digitalWrite(i, HIGH);

    //Serial.print(value, HEX);
    //Serial.print(" ");
  }

  //Serial.print("High address ");
  //Serial.print(registerTwo, HEX);
  //Serial.print(" ");

  for (int i=0;i<8;i++) {
    uint8_t value = (registerTwo >> i) & 1;

    if (value == 0)
      expanders[1].digitalWrite(i, LOW);
    else
      expanders[1].digitalWrite(i, HIGH);

    //Serial.print(value, HEX);
    //Serial.print(" ");
  }

  //Serial.println("");
}

uint8_t get_data (void) {
  uint8_t data = 0;
  uint8_t pind = PIND; // 0 - 7
  uint8_t pinb = PINB; // 8 - 13

  // We start at D2, so shift out unnecessary bits
  data = pind >> 2;

  // Now add remaining bits from pinb
  data |= (pinb & 1) << 6;
  data |= ((pinb >> 2) & 1) << 7;

  /* Optimized version of this:
  data |= digitalRead(dataB0) << 0;
  data |= digitalRead(dataB1) << 1;
  data |= digitalRead(dataB2) << 2;
  data |= digitalRead(dataB3) << 3;
  data |= digitalRead(dataB4) << 4;
  data |= digitalRead(dataB5) << 5;
  data |= digitalRead(dataB6) << 6;
  data |= digitalRead(dataB7) << 7;
  */
  
  return data;
}

void set_data (uint8_t data) {
  digitalWrite(dataB0, (data & (1 << 0)));
  digitalWrite(dataB1, (data & (1 << 1)));
  digitalWrite(dataB2, (data & (1 << 2)));
  digitalWrite(dataB3, (data & (1 << 3)));
  digitalWrite(dataB4, (data & (1 << 4)));
  digitalWrite(dataB5, (data & (1 << 5)));
  digitalWrite(dataB6, (data & (1 << 6)));
  digitalWrite(dataB7, (data & (1 << 7)));
}

uint8_t read_byte (uint16_t address) {
  set_address(address);
  return get_data();
}

void write_byte (uint16_t address, uint8_t data) {
  set_address(address);
  set_data(data);
  switch (chip) {
    case C16:
      digitalWrite(chipEnable, HIGH);
      delay(15);
      digitalWrite(chipEnable, LOW);
      break;
    case C32:
    case C64:
    case C128:
    case C256:
    case C512:
    default:
      digitalWrite(chipEnable, LOW);
      delayMicroseconds(110);
      digitalWrite(chipEnable, HIGH);
      break;
  }
}

float get_voltage (void) {
  float vADC = (analogRead(voltageControl) / 1024.) * 5.;
  float current = vADC / rBottom;
  return (current * (rTop + rBottom));
}
