const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');

const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(cors());
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true
  })
);
app.use(
  fileUpload({
    debug: true
  })
);

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

const client = new Client({
  authStrategy: new LocalAuth({})
});

client.on('message', (msg) => {
  if (msg.body == '!ping') {
    msg.reply('pong');
  } else if (msg.body == 'good morning') {
    msg.reply('selamat pagi');
  } else if (msg.body == '!groups') {
    client.getChats().then((chats) => {
      const groups = chats.filter((chat) => chat.isGroup);

      if (groups.length == 0) {
        msg.reply('You have no group yet.');
      } else {
        let replyMsg = '*YOUR GROUPS*\n\n';
        groups.forEach((group, i) => {
          replyMsg += `ID: ${group.id._serialized}\nName: ${group.name}\n\n`;
        });
        replyMsg +=
          '_You can use the group id to send a message to the group._';
        msg.reply(replyMsg);
      }
    });
  }
});

client.on('authenticated', (session) => {
  sessionCfg = session;
});

client.on('disconnected', (reason) => {
  client.destroy();
  client.initialize();
});

client.initialize();

//Socket IO
io.on('connection', function (socket) {
  socket.emit('message', 'Connecting...');
  client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR Code received, scan please!');
    });
  });
  client.on('auth_failure', function (session) {
    socket.emit('message', 'Auth failure, restarting...');
  });
  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp is ready!');
    socket.emit('message', 'Whatsapp is ready!');
  });
  client
    .getState()
    .then((data) => {
      console.log(data);
      socket.emit('message', data);
      if (data === 'CONNECTED') {
        return socket.emit('authenticated', 'Whatsapp is authenticated!');
      }
      socket.emit('message', data);
    })
    .catch((err) => {
      console.log(err);
    });
});

const checkRegisteredNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
};

// Send message
app.post(
  '/sendmessage',
  [body('number').notEmpty(), body('message').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      console.log(errors.mapped());
      return res.status(422).json({
        status: false,
        message: errors.mapped()
      });
    }

    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(number);

    if (!isRegisteredNumber) {
      console.log('The number is not registered');
      return res.status(422).json({
        status: false,
        message: 'The number is not registered'
      });
    }

    client
      .sendMessage(number, message)
      .then((response) => {
        res.status(200).json({
          status: true,
          response: response
        });
      })
      .catch((err) => {
        console.log(err);

        res.status(500).json({
          status: false,
          response: err
        });
      });
  }
);

server.listen(port, function () {
  console.log('App running on *: ' + port);
});
