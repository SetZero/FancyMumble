"use strict";

var mumble = require('mumble');

const {app, BrowserWindow} = require('electron')
const {ipcMain} = require('electron')
const path = require('path')
const url = require('url')
const fs = require('fs');

var tree = "";

//Mumble Options 
var options = {
  key: fs.readFileSync( 'certs/key.pem' ),
  cert: fs.readFileSync( 'certs/cert.pem' )
};
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win
let mumbleConnection

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({
    transparent: false, frame: false,
    width: 600, height: 400
  })

  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'renderer/index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  win.webContents.openDevTools();
  ipcMain.on('CredentialSender', MumbleCredentialsHandler);
  ipcMain.on('TextSender', MumbleTextSendHandler);
  //mumbleHandler();

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

//---------------------------------
//Event Handler
//---------------------------------

var onInit = function(connection) {

  console.log( 'Connection initialized' );
  var user = connection.users[connection.sessionId];
  var channel = connection.channels[0];
  console.log(channel);
};

var sessions = {};

var onUserState = function( state ) {
    sessions[state.session] = state;
};

var onVoice = function( voice ) {
  //console.log( 'Mixed voice' );

  var pcmData = voice;
};

var onEvent = function( data ) {
  //console.log('event', data.handler, 'data', data.message);
};

var onText = function( data ) {
  var user = sessions[data.actor];
  console.log(user.name + ':', data.message);
  var sendArray = {};
  sendArray["username"] = user.name;
  sendArray["message"] = data.message;

  win.webContents.send("TextReceiver", sendArray);
};

var onReady = function( connection ) {
  console.log("Ready!");
  showMainMenu();  
};

//---------------------------------
// Mumble Functions
//---------------------------------
function buildChannelTree(channel, level) {
  for(var i = 0; i < level; i++) {
      tree += "   ";
  }
  tree += "  - " + channel.name + ": ";
  for(var u in channel.users) {
      var user = channel.users[u];
      tree += user.name + ", ";
  }
  tree += "\n";
  for(var c in channel.children) {
      buildChannelTree(channel.children[c], level + 1);
  }
}

function showMainMenu() {
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'renderer/mainWindow.html'),
    protocol: 'file:',
    slashes: true
  }));
  /*win.setBounds({
    width: 1000,
    height: 800
  });*/
  var bounds = win.getBounds();
  bounds.x -= 600;
  bounds.y -= 300;
  bounds.width = 1200;
  bounds.height = 600;
  win.setBounds(bounds);
}

function MumbleCredentialsHandler(event, arg) {
  console.log("Join: " + arg["server"] + ", Username: " + arg["username"]);
  mumbleHandler(arg["server"], arg["username"]);
}

function MumbleTextSendHandler(event, arg) { 
  var list = mumbleConnection.users();
  for(var key in list) {
    var user = list[key];
    console.log("  - " + user.name + " in channel " + user.channel.name);
    if(user.name == 'Sebi') {
      console.log(arg['message']);
      user.channel.join();
      user.channel.sendMessage(arg['message']);
    }
  }
}

//---------------------------------
//Mumble Main Event
//---------------------------------
function mumbleHandler(serverIP, userName) {
  console.log( 'Connecting' );
  mumble.connect( serverIP, options, function ( error, connection ) {
    if( error ) { throw new Error( error ); }

    console.log( 'Connected' );

    mumbleConnection = connection;
    connection.authenticate( userName );
    connection.on( 'initialized', onInit );
    connection.on( 'ready', onReady );
    connection.on( 'voice',  onVoice );
    connection.on( 'protocol-in', onEvent);
    connection.on( 'textMessage', onText);
    connection.on( 'userState', onUserState);
  });
}