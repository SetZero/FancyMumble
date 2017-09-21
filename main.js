"use strict";

var mumble = require('mumble');

const {app, BrowserWindow} = require('electron')
const {ipcMain} = require('electron')
const path = require('path')
const url = require('url')
const fs = require('fs');
const clipboard = require('electron').clipboard
const Fuse = require('fuse.js')

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




//------------------
//Classes
//------------------

class MumbleChannelManager {
  constructor() {
  }
  buildUserChannelTree() {
    var channelInfo = {};
    var list = mumbleConnection.users();
    channelInfo['users'] = {channels: []};
  
    for(var key in list) {
      var user = list[key];
      var index = channelFind(channelInfo['users']['channels'],  user.channel.name);
      if(index < 0) {
        var index = channelInfo['users']['channels'].push({channelname: user.channel.name, channelid: user.channel.id, users: []}) - 1; 
      }
      console.log(index);
      channelInfo['users']['channels'][index]['users'].push({username: user.name, userid: user.id});
      console.log(user.id);
    }
    return channelInfo;
  }
  
  updateUserChannelTree() {
    var channelInfo = this.buildUserChannelTree();
    win.webContents.send("ChannelInfoReceiver", channelInfo);
  }
  
  buildChannelTree(channel, level, channellist) {
    if(typeof channellist === 'undefined')
      var channellist = [];
    channellist.push({name: channel.name, id: channel.id, usercount: channel.users.length});
    for(var c in channel.children) {
      this.buildChannelTree(channel.children[c], level + 1, channellist);
    } 
    return channellist;
  }

  MumbleJoinChannelByIdHandler(event, arg) {
    var newChannel = mumbleConnection.user.client.channelById(arg);    
    newChannel.join();
  }
  MumbleChannelSearchHandler(event, arg) {
    if(typeof this.channels === 'undefined')
      this.channels = channelManager.buildChannelTree(mumbleConnection.rootChannel, 0); 

    var options = {
      shouldSort: true,
      threshold: 0.3,
      location: 0,
      distance: 100,
      maxPatternLength: 32,
      minMatchCharLength: 1,
      keys: [
        "name"
      ]
    };
    var fuse = new Fuse(this.channels, options); // "list" is the item array
    var result = fuse.search(arg);
    console.log(result);
    win.webContents.send("ChannelSearchReceiver", result);
  }
}

var channelManager = new MumbleChannelManager()

//------------------

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
  ipcMain.on('ImageSender', MumbleImageSendHandler);
  ipcMain.on('ImageFileSender', MumbleImageFileSendHandler);
  ipcMain.on('ChannelJoinByID', channelManager.MumbleJoinChannelByIdHandler);
  ipcMain.on('ChannelSearchSender', channelManager.MumbleChannelSearchHandler);
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
    console.log(state);
    channelManager.updateUserChannelTree();
};

var onVoice = function( voice ) {
  //console.log( 'Mixed voice' );

  var pcmData = voice;
};

var onEvent = function( data ) {
  //console.log('event', data.handler, 'data', data.message);
};

var onText = function( data ) {
  console.log(data);
  var user = mumbleConnection.userBySession(data.actor);
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
function channelFind(channelInfo, find) {
  for(var index in channelInfo) {
    if(channelInfo[index].channelname === find) {
      return index;
    }
  }
  return -1;
}


function showMainMenu() {
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'renderer/mainWindow.html'),
    protocol: 'file:',
    slashes: true
  }));
  var bounds = win.getBounds();
  bounds.x -= 600;
  bounds.y -= 300;
  bounds.width = 1200;
  bounds.height = 600;
  win.setBounds(bounds);
  win.webContents.on('did-finish-load', function() {
    var sendArray = {};
    console.log("send it!");
    sendArray['dividerMessage'] = "Joined Channel " + mumbleConnection.user.channel.name;
    win.webContents.send("TextEventReceiver", sendArray);
    channelManager.updateUserChannelTree();
  });
}

function MumbleCredentialsHandler(event, arg) {
  console.log("Join: " + arg["server"] + ", Username: " + arg["username"]);
  mumbleHandler(arg["server"], arg["username"]);
}

function MumbleTextSendHandler(event, arg) { 
  console.log(mumbleConnection);
  mumbleConnection.user.channel.sendMessage(arg['message']);
}

function MumbleImageSendHandler(event, arg) { 
  fs.readFile( arg, function (err, data) {
    if (err) {
      throw err; 
    }
    var buffer = (new Buffer(data).toString('base64'));
    console.log("Size: " + buffer.length);
    mumbleConnection.user.channel.sendMessage('<img src="data:image/PNG;base64,' + encodeURIComponent(buffer) + ' "/>');
    //mumbleConnection.user.channel.sendMessage('<video width="320" height="240" controls><source src="data:image/PNG;base64,' + encodeURIComponent(buffer) + ' "/></video>');
  });
}
function MumbleImageFileSendHandler(event, arg) { 
  console.log("Got it!");
  var buffer = clipboard.readImage().toJPEG(50);
  var buffer = (new Buffer(buffer).toString('base64'));
  console.log("Size: " + buffer.length);
  mumbleConnection.user.channel.sendMessage('<img src="data:image/PNG;base64,' + encodeURIComponent(buffer) + ' "/>');
};

//--------------------------------
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
