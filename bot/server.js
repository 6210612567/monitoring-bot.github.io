'use strict';

const express = require('express');
const mqtt = require('mqtt');
require('dotenv').config();
const { MongoClient } = require("mongodb");
const line = require('@line/bot-sdk');
const ngrok = require('ngrok');



// Constants
const PORT = 8080;
const HOST = '0.0.0.0';

const line_cfg = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CH_SECRET
};
const lineClient = new line.Client(line_cfg);


// App
var data_idx = 0;
var temp_value = 0;
var humid_value = 0;
const app = express();

app.use('/liff',express.static('liff'));

app.get('/api/sensor',async(req, res) => {
    const ans = {idx:data_idx , temp:temp_value , humid:humid_value}
    console.log(ans);
    res.send(JSON.stringify(ans))
})

app.get('/', async (req, res) => {

    const value = parseInt(req.query.value)
    const results = await try_query(value)
    const summary = results.map(a => a.timestamp)
    console.log(results)
    res.send(summary.toString());

});



//MQTT
const mqttclient  = mqtt.connect('mqtt://broker.hivemq.com');
mqttclient.on('connect', function () {
    mqttclient.subscribe('cn466/miniproject1', function (err) {
        if (!err) {
            const obj = {status:'ok'};
            mqttclient.publish('cn466/miniproject1status', JSON.stringify(obj));
            console.log("connection completed")
        }
    })
});
mqttclient.on('message', function (topic, message) {
    // message is Buffer
    console.log(message.toString());
    const msg = JSON.parse(message.toString());
    try_insert(msg).catch(console.dir);
    data_idx = data_idx + 1;
    const temp_value = parseFloat(msg.temperature).toFixed(2);
    const humid_value = parseFloat(msg.humidity).toFixed(2);
    const pressure_value = parseFloat(msg.pressure).toFixed(2);
    
    var context =
    `Temp : ${temp_value}
    Humidity : ${humid_value}
    Pressure : ${pressure_value}`;
})


//database
const mongodbclient = new MongoClient(process.env.MONGODB_URI);
async function try_connect() {
    try {
        await mongodbclient.connect();
        const database = mongodbclient.db('cn466');
        try{
            await database.createCollection("sensor");
            console.log("Collection created!");  
            
        } catch (err) {
            console.log("Collection existed");
        }
    }
    finally{
        mongodbclient.close();
    }
}

try_connect().catch(console.dir);

async function try_insert(value) {
    try {
        await mongodbclient.connect();
        const database = mongodbclient.db('cn466');
        const sensor = database.collection('sensor');
        const doc = {   
            temperature : value.temperature,
            humidity : value.humidity,
            pressure : value.pressure,          

                        
                    }
        console.log("Add data");
        const result = await sensor.insertOne(doc);
        
    }
    finally{
        await mongodbclient.close();
    }
}

async function try_query(value) {

    var results = []

    try {

        await mongodbclient.connect();
        const database = mongodbclient.db('cn466');
        const sensor = database.collection('sensor')
        const cond = {value: value}
        results = await sensor.find(cond).toArray()    

    } finally {
        await mongodbclient.close()
    }

    //console.log(results)  
    return results

}

async function show_data() {
    var results = {}
    try {
        await mongodbclient.connect();
        const database = mongodbclient.db('cn466');
        const sensor = database.collection('sensor')
        results = await sensor.find().sort({ "timestamp": -1 }).limit(1).toArray()
    } finally {
        await mongodbclient.close()
    }  


    return results
}

//line
app.post('/callback', line.middleware(line_cfg), (req, res) => {
    Promise
      .all(req.body.events.map(handleEvent))
      .then((result) => res.json(result))
      .catch((err) => {
        console.error(err);
        res.status(500).end();
      });
});

async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
      // ignore non-text-message event
      return Promise.resolve(null);
    }
  
    // create a echoing text message
    var echo = { type: 'text', text: event.message.text };
    switch (event.message.text) {
        case "on":
            mqttclient.publish('cn466/miniproject1status', "on");
            echo.text = "Sensor started"
            return lineClient.replyMessage(event.replyToken, echo);

        case "off":
            mqttclient.publish('cn466/miniproject1status', "off");
            echo.text = "Sensor closed"
            return lineClient.replyMessage(event.replyToken, echo);
            break
        case "data":
            const data = await show_data()
            console.log(`output = ${(JSON.stringify(data[0]))}`)

            var temp = parseFloat(data[0].temperature).toFixed(2)
            var humidity = parseFloat(data[0].humidity).toFixed(2)
            var pressure = parseFloat(data[0].pressure).toFixed(2)
            echo.text =
            
            `Temp : ${temp}
Humidity : ${humidity}
Pressure : ${pressure}`;

            return lineClient.replyMessage(event.replyToken, echo);

        default:
            return lineClient.replyMessage(event.replyToken, echo);
    }
}

app.listen(PORT, () => {
    console.log("It seems that BASE_URL is not set. Connecting to ngrok...")
    ngrok.connect({addr:PORT, authtoken:process.env.NGROK_AUTH_TOKEN}).then(url => {
    console.log('listening on ' + url + '/callback');
    lineClient.setWebhookEndpointUrl(url + '/callback');
    }).catch(console.error);
});


async function enable_ngrok() {
    const url = await ngrok.connect({
        proto: "http",
        addr: PORT,
        authtoken: process.env.NGROK_AUTH_TOKEN
    });
    return url;
}

app.get('/', (req, res) => {
    res.send("index !!")
});