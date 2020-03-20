'use strict';
const nconf = require('nconf');
const SerialPort = require('serialport');

nconf.argv()
     .file({ file: 'config.json' });

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

function saveLatestData(data) {
  portBuffer = Buffer.concat([portBuffer, data]);
  console.log('Got ', data);
  console.log('Full buffer: ', portBuffer);

  //while (true) {
    //let parsedBytes = parseMessages(portBuffer);
    //console.log('consumed ' + parsedBytes + ' bytes');

    // Not enough data yet
    //if (parsedBytes == 0) return;

    //if (parsedBytes < portBuffer.length) {
      // Cut off the consumed data from the buffer
      //portBuffer = portBuffer.slice(parsedBytes);
      // Parse the remaining data during next loop iteration
      //console.log('Remaining data: ', portBuffer);
    //} else {
      // Buffer was consumed entirely and there is no additional data remaining
      //portBuffer = Buffer.alloc(0);
      //break;
    //}
  //}
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

let args = process.argv.slice(2);
//console.log('myArgs: ', args);

if (args.length != 2) {
  console.log('Usage: `node main.js X filename.bin`, where X is either r or w');
  myPort.close();
  return;
}