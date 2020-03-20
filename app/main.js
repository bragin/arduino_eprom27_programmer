'use strict';
const nconf = require('nconf');
const SerialPort = require('serialport');

nconf.argv()
     .file({ file: 'config.json' });

let chipType;
let opType;
let args = process.argv.slice(2);
if (args.length != 3) {
  console.log('Usage: `node main.js T M filename.bin`, where T is 16-512 and M is either r or w');
  return;
} else {
  switch (args[0]) {
    case '16':
      chipType = 'a';
      break;
    case '32':
      chipType = 'b';
      break;
    case '64':
      chipType = 'c';
      break;
    case '128':
      chipType = 'd';
      break;
    case '256':
      chipType = 'e';
      break;
    case '512':
      chipType = 'f';
      break;
    default:
      console.error('Unknown chip, exiting');
      return;
  }

  opType = args[1];
  if (opType != 'r' && opType != 'w') {
    console.error(`Unrecognized operation mode ${opType}, exiting`);
    return;
  }
}

// Serial port
let portName = nconf.get('port');
const ByteLength = SerialPort.parsers.ByteLength;
let myPort = new SerialPort(portName, { baudRate: 115200 });
let portBuffer = Buffer.alloc(0);

// these are the definitions for the serial events:
myPort.on('open', showPortOpen);
myPort.on('data', saveLatestData);
myPort.on('close', showPortClose);
myPort.on('error', showError);

// these are the functions called when the serial events occur:
function showPortOpen() {
  console.log('port open. Data rate: ' + myPort.settings.baudRate);
}

function parseMessage(buf) {
  const msgWaitCommands = 'Wait commands...';
  let str = buf.toString();

  // 1. Selecting chip
  let chipSelectIndex = str.indexOf('Chip not selected!');
  if (chipSelectIndex !== -1) {
    // Select chip
    let cmdIndex = str.indexOf(msgWaitCommands);
    if (cmdIndex === -1)
      return 0;

    // Send chip select command
    myPort.write(Buffer.from(chipType, 'ascii'), 'binary');
    
    return cmdIndex + msgWaitCommands.length + 2;
  }

  // 2. Chip select acknowledge and operation mode set
  let chipSelectAck = str.indexOf('Selected ');
  if (chipSelectAck !== -1) {
    let chipSelectFinish = str.indexOf(' chip.', chipSelectAck)
    console.log(`Chip ${str.substring(chipSelectAck + 9, chipSelectFinish)}`);
    let cmdIndex = str.indexOf(msgWaitCommands);
    if (cmdIndex === -1) return 0;

    // Send read or write operation request
    myPort.write(opType, 'binary')

    return cmdIndex + msgWaitCommands.length + 2;
  }

  // 3. Handling read command
  let readModeInd = str.indexOf('Read mode.');
  if (readModeInd !== -1) {
    let cmdIndex = str.indexOf(msgWaitCommands);
    if (cmdIndex === -1) return 0;

    // We have full buffer of hex data, save it
    let romData = buf.slice(readModeInd + 12, cmdIndex - 2);

    console.log('DATA <');
    console.log(romData.toString());
    console.log('DATA >');

    return cmdIndex + msgWaitCommands.length + 2;
  }

  return 0;
}

function saveLatestData(data) {
  portBuffer = Buffer.concat([portBuffer, data]);
  //console.log('Got ', data);
  //console.log('Full buffer: ', portBuffer.toString());

  while (true) {
    let parsedBytes = parseMessage(portBuffer);
    //console.log('consumed ' + parsedBytes + ' bytes');

    // Not enough data yet
    if (parsedBytes == 0) return;

    if (parsedBytes < portBuffer.length) {
      // Cut off the consumed data from the buffer
      portBuffer = portBuffer.slice(parsedBytes);
      // Parse the remaining data during next loop iteration
      console.log('Remaining data: ', portBuffer);
    } else {
      // Buffer was consumed entirely and there is no additional data remaining
      portBuffer = Buffer.alloc(0);
      break;
    }
  }
}

function showPortClose() {
  console.log('port closed.');
}

function showError(error) {
  console.log('Serial port error: ' + error);
}

function writeRom(buf) {
  //myPort.write(msgBuffer, 'binary');
}
