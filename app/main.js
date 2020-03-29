'use strict';
const fs = require('fs');
const nconf = require('nconf');
const SerialPort = require('serialport');

nconf.argv()
     .file({ file: 'config.json' });

let chipType;
let opType;
let romFile;
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

  if (opType === 'r') {
    romFile = args[2];
  } else {
    romFile = fs.readFileSync(args[2], { encoding: 'binary' });
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
  const msgWaitCommands = 'Wait commands...\r\n';

  // 1. Selecting chip
  let chipSelectIndex = buf.indexOf('Chip not selected!');
  if (chipSelectIndex !== -1) {
    // Select chip
    let cmdIndex = buf.indexOf(msgWaitCommands);
    if (cmdIndex === -1)
      return 0;

    // Send chip select command
    myPort.write(Buffer.from(chipType, 'ascii'), 'binary');
    
    return cmdIndex + msgWaitCommands.length + 2;
  }

  // 2. Chip select acknowledge and operation mode set
  let chipSelectAck = buf.indexOf('Selected ');
  if (chipSelectAck !== -1) {
    let chipSelectFinish = buf.indexOf(' chip.', chipSelectAck)
    console.log(`Chip ${buf.slice(chipSelectAck + 9, chipSelectFinish)}`);
    let cmdIndex = buf.indexOf(msgWaitCommands);
    if (cmdIndex === -1) return 0;

    // Send read or write operation request
    myPort.write(opType, 'binary')

    return cmdIndex + msgWaitCommands.length + 2;
  }

  // 3. Handle read command
  let readModeInd = buf.indexOf('Read mode.');
  if (readModeInd !== -1) {
    let bytesRead;

    let cmdIndex = buf.indexOf(msgWaitCommands);
    if (cmdIndex === -1) {
      bytesRead = buf.length - readModeInd - 12;
      process.stdout.write(`Read ${bytesRead} bytes\r`);
      return 0;
    } else {
      bytesRead = cmdIndex - readModeInd - 14;
      console.log(`Read ${bytesRead} bytes`);
    }

    // We have full buffer of hex data, save it to a file
    const romData = buf.slice(readModeInd + 12, cmdIndex - 2);

    //console.log('DATA <');
    //console.log(romData.toString('hex'));
    //console.log('DATA >');

    fs.writeFile(romFile, romData, (err) => {
      if (err) throw err;
      console.log('The file has been saved!');
    });

    return cmdIndex + msgWaitCommands.length + 2;
  }

  // 4. Handle write command
  let completeIndex = buf.indexOf('Complete block ');
  if (completeIndex !== -1) {
    let finishIndex = buf.indexOf('\n', completeIndex + 15);
    let index = parseInt(buf.slice(completeIndex + 15, finishIndex), 10);

    //console.log(`Block ${index} completed`);
    let cmdIndex = buf.indexOf(msgWaitCommands);
    if (cmdIndex !== -1) {
      // This is the end
      console.log('Last block was written!')
      return cmdIndex + msgWaitCommands.length + 2;
    }

    return finishIndex + 1;
  }

  let writeBlockInd = buf.indexOf('Write block ');
  if (writeBlockInd !== -1) {
    let finishIndex = buf.indexOf('\n', writeBlockInd + 12);

    // Get write block index
    let offset = parseInt(buf.slice(writeBlockInd + 12, finishIndex), 10);
    process.stdout.write(`Writing block ${offset}\r`);
    //console.log(`Writing block ${offset}\r`);

    // Send it!
    const romData = romFile.slice(offset, offset + 16);
    myPort.write(romData, 'binary');

    // And consume this part
    return finishIndex + 1;
  }

  // 5. Handle errors during write
  let errorBlockInd = buf.indexOf('Error on block ');
  if (errorBlockInd !== -1) {
    let cmdIndex = buf.indexOf(msgWaitCommands);
    if (cmdIndex === -1) return 0;

    let finishIndex = buf.indexOf('\n', errorBlockInd + 15);

    // Get write block index
    let index = parseInt(buf.slice(errorBlockInd + 15, finishIndex), 10);
    console.log(`Error on block ${index}`);

    return cmdIndex + msgWaitCommands.length + 2;
  }

  errorBlockInd = buf.indexOf('Error on address ');
  if (errorBlockInd !== -1) {
    let cmdIndex = buf.indexOf(msgWaitCommands);
    if (cmdIndex === -1) return 0;

    let finishIndex = buf.indexOf('\n', errorBlockInd + 15);

    // Get address error
    let address = parseInt(buf.slice(errorBlockInd + 15, finishIndex), 10);
    console.log(`Error on address ${index}`);

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
      //console.log('Remaining data: ', portBuffer.toString());
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
