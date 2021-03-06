'use strict';

/*loading up the modules that will need  */  
const dialogflow = require('dialogflow');
const config = require('./config'); //load the config file that is in the same directory as app.js
const express = require('express');
const crypto = require('crypto'); //crypto will need for verifying request signature
const bodyParser = require('body-parser'); //body parser is for parsing request data. 
const request = require('request'); //Request for making request
const app = express(); //here create the app with express //exprese is a node.js application framework that provides a robust set of features for applications. In other words, it speed up application development.
const uuid = require('uuid'); 
 
const pg = require('pg');
pg.defaults.ssl = true;
 
const userService = require('./user');


const Persona = require("articulate-nlg").default;


class Dog extends Persona {
    constructor() {
        super(...arguments);
        this.createVocab = () => {
            //Persona helper functions, for convenience.
            const say = this.say;
            const capitalize = this.capitalize;
            const capSay = this.capSay;
            const choose = this.choose;
            const chance = this.chance;
            const cycle = this.cycle;
            const param = this.param;
            const ifElse = this.ifElse;
            //Return an object containing strings mapped to functions,
            //which return the text.
            return {

                people: () => cycle({group:"people"},"a tourist", "one of the tourists", "based on my database, a traveller", 
                "one of the travellers","one of the past visitors","a The Top Penang visitor","a journeyer"),
                
                mention:()=> cycle({group:"cycle"},"said","mentioned","would like to express","told","claimed","explained","stated","conveyed"),
              
                emoji: () => cycle({ group: "emoji" }, "😀", "😍", "😎", "😉", "😆", "😁‍"),
              
                preSentence: () => capSay("people") + " " + say("mention") + 
                    " that "                 
      };
    };
// Create and set the vocab for Dog.
this.vocab = this.createVocab();
}
}
let max = new Dog();







let sentimentService = require('./sentiment-service');

const ttp = require('./ttp');

var ttp_comparative =0; 
var ttp_directory =2; 
var ttp_fee =9; 
var ttp_guidance = 11; 
var ttp_time =25; 
var touristSays = 1;
var casualQuickReplies = 1;
var peopleLike = 1;
var fee_opinion = 1;


// Messenger API parameters
/* here verify the config variables. If they're not, will throw an error */
if (!config.FB_PAGE_TOKEN) {
    throw new Error('missing FB_PAGE_TOKEN');
}
if (!config.FB_VERIFY_TOKEN) {
    throw new Error('missing FB_VERIFY_TOKEN');
}
if (!config.GOOGLE_PROJECT_ID) {
    throw new Error('missing GOOGLE_PROJECT_ID');
}
if (!config.DF_LANGUAGE_CODE) {
    throw new Error('missing DF_LANGUAGE_CODE');
}
if (!config.GOOGLE_CLIENT_EMAIL) {
    throw new Error('missing GOOGLE_CLIENT_EMAIL');
}
if (!config.GOOGLE_PRIVATE_KEY) {
    throw new Error('missing GOOGLE_PRIVATE_KEY');
}
if (!config.FB_APP_SECRET) {
    throw new Error('missing FB_APP_SECRET');
}
if (!config.SERVER_URL) { //used for ink to static files
    throw new Error('missing SERVER_URL');
}
if (!config.WEATHER_API_KEY) { //weather api key
    throw new Error('missing WEATHER_API_KEY');
}
if (!config.PG_CONFIG) { //pg config
    throw new Error('missing PG_CONFIG');
}
if (!config.FB_PAGE_INBOX_ID) { //page inbox id - the receiver app
    throw new Error('missing FB_PAGE_INBOX_ID');
}

//set the port to 5000
app.set('port', (process.env.PORT || 5000))

//verify request came from facebook
app.use(bodyParser.json({
    verify: verifyRequestSignature //verifyRequestSignature is a function that verify request came from facebook, from the right application
}));

//serve static files in the public directory
app.use(express.static('public')); //means set the folder 'public' where we store images, videos or anything we want to share with the user. Basically this line makes the folder visible, so it is accessible via the http

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: false
}));

// Process application/json
app.use(bodyParser.json()); //this body parser module helps to parses requests




/*set up the dialog flow client here. I create a credentials object that consists of google
email and private key, then pass both the credentials and google project id 
to dialogflow session client, this is how the authenticate dialogflow client*/
const credentials = {
    client_email: config.GOOGLE_CLIENT_EMAIL, //client email and private key came from service account
    private_key: config.GOOGLE_PRIVATE_KEY,
};

const sessionClient = new dialogflow.SessionsClient(
    {
        projectId: config.GOOGLE_PROJECT_ID,
        credentials
    }
);


const sessionIds = new Map();
const usersMap = new Map();

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
    console.log("request");                            //the token is verified. This is the secret heroku app and fb app share and validate
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Need to be sure to subscribe the app to the page to receive callbacks
 * for the page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 */
 //this part is where we catch events, that will come to webhook
app.post('/webhook/', function (req, res) {
    var data = req.body;
    console.log(JSON.stringify(data));

    // Make sure this is a page subscription, then iterate thru each messaging event. For each messaging event, check what kind of event it is
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            /*In the webhook, I subscribed to the messages and messaging postbacks*/
            /*Messages are the text user send us and postbacks are the triggered when user clicks on a button or clicks on the item in the menu, or get started button or any other button  */

            //Secondary Receiver is in control - listen on standby channel
            if (pageEntry.standby) { //here the messages will come when the bots is not in control, when user is talking to live agent
                //iterate webhook events from standby channel
                pageEntry.standby.forEach(event => {//loop thru standby messages
                    const psid = event.sender.id; //read the senderid and the message sent
                    const message = event.message;
                    console.log('message from: ', psid);
                    console.log('message to inbox: ', message);

                   // if(message == "aaa")
                       // messageText("masuk this loop le");
                      //  sendTextMessage(psid, "masuk this loop le :)");
                       // console.log("haha in hereeeeeeeeeee");
                        //text = 'The Primary Receiver is taking control back. \n\n Tap "Pass to Inbox" to pass thread control to the Page Inbox.';
                         //title = 'Pass to Inbox';
                        //payload = 'pass_to_inbox';
        
        //sendQuickReply(psid, text, title, payload);
                        
                         
                    
                    
                    //console.log("event :" + event[1]);
                   // sendTextMessage(psid, "send texxxxxxxxttttt :)");
                    //takeThreadControl(psid);

                });
            }

            //Bot is in control - listen for messages
            if (pageEntry.messaging){ //checking if I have messaging
                //Iterate over each messaging event
                pageEntry.messaging.forEach(function (messagingEvent) {
                    if (messagingEvent.optin) { //first one is optin, that is authentication
                        receivedAuthentication(messagingEvent);
                    } else if (messagingEvent.message) { //message, the one we will be listening for, includes text messages, quick replies, and attachments
                        receivedMessage(messagingEvent);
                    } else if (messagingEvent.delivery) { //delivery confirmation
                        receivedDeliveryConfirmation(messagingEvent);
                    } else if (messagingEvent.postback) { //a postback can be a click on button, menu or structured message. We need to catch it if we want to perform any action after the event is triggered.
                        receivedPostback(messagingEvent); // the button wont work if dont catch button click and trigger, for instance another intent in the code
                    } else if (messagingEvent.read) { //message read
                        receivedMessageRead(messagingEvent);
                    } else if (messagingEvent.account_linking) { //account linking
                        receivedAccountLink(messagingEvent);
                    } else { //unknown event, catch the event I didnt subscribe to
                        console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                    }
                });
            }
        });

        //Assume all went well.
        //must send back a 200, within 20 seconds
        res.sendStatus(200);
    }
});

//set global user data that can be accessed from anywhere in the code
function setSessionAndUser(senderID) {
    if (!sessionIds.has(senderID)) {
        sessionIds.set(senderID, uuid.v1());
    }

    if (!usersMap.has(senderID)) { //check if userMap contains a key senderID
        userService.addUser(function(user){ //first paramter is callback 
            usersMap.set(senderID, user); //in the userMap we store the object that we get from the module (that is the object retrieved from FB graph API) //store it under the key 'senderID'. Here we call it senderID, in the module we call it userID and in fact, it's a FB ID
        }, senderID);  //second paramter is userID                    
    }
}


//handle everything user write to the bot
function receivedMessage(event) {

    var senderID = event.sender.id; //first extract data from the request, so we read the sender and receiver
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp; //then we read the time of the message and the message itself
    var message = event.message;

    setSessionAndUser(senderID); //use this line to replace the if block below so that it is global
    /*if (!sessionIds.has(senderID)) {
        sessionIds.set(senderID, uuid.v1());
    }*/


    //console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
    //console.log(JSON.stringify(message));


    


    var isEcho = message.is_echo; //check if the message is an echo. That is the message sent by my page
    var messageId = message.mid; //then read messageID, appId, and metadata
    var appId = message.app_id;
    var metadata = message.metadata;

    //We may get a text or attachment but not both (only one of these 3 can be sent at once)
    var messageText = message.text; //the message, attachments and the quick reply
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;

    if (isEcho) { //if this is an echo, call handleEcho, that just logs data to log
        handleEcho(messageId, appId, metadata);
        return;
    } else if (quickReply) {//if is quickReply, call handleQuickReply
        handleQuickReply(senderID, quickReply, messageId);
        return;
    }


    if (messageText) {
        //if it is a text message, send it to dialogflow
        sendToDialogFlow(senderID, messageText); 

        sentimentService.addUserSentiment(senderID, messageText);

    } else if (messageAttachments) { //if it is attachment(file, image, sticker, video), then call the handleMessageAttachments
        handleMessageAttachments(messageAttachments, senderID);
    }
}


function handleMessageAttachments(messageAttachments, senderID){
    //send back to user's response 'attachment received'
    sendTextMessage(senderID, "Attachment received. I will let my human teammates have a look on it. Thank you :)");
    setTimeout(function() {
        var responseNext = "What I can do to help you next?"
             var replies = [{
                 "content_type": "text",
                 "title": "Opinion",
                 "payload": "Opinion",
             },
             {
                 "content_type": "text",
                 "title": "Rating",
                 "payload": "Rating",
             },
             {
                 "content_type": "text",
                 "title": "Talk to live agent",
                 "payload": "Talk to live agent",
             }];
             sendQuickReply(senderID, responseNext, replies)
    }, 2000);
}

//send the quick reply to Dialogflow to handle it for us
function handleQuickReply(senderID, quickReply, messageId) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
    //send payload to dialogflow
    sendToDialogFlow(senderID, quickReplyPayload);
    sentimentService.addUserSentiment(senderID, quickReplyPayload);
}

//https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
    // Just logging message echoes to console
    console.log("Received echo for message %s and app %d with metadata %s", messageId, appId, metadata);
}

function handleDialogFlowAction(sender, action, messages, contexts, parameters) {
    switch (action) {

        case "intro":

        sendTextMessage(sender, "I provide the summary reviews given by the past tourists of The Top Penang.");
        setTimeout(function() {
                sendTextMessage(sender,'I categoried the reviews into 5 groups such as guidance, comparative, directory, time and fee.');
            }, 1000);
        

        setTimeout(function() {
            var intro = "At any time, try me by clicking on the menu below😊"
                    var replies = [{
                        "content_type": "text",
                        "title": "Opinion",
                        "payload": "Opinion",
                    },
                    {
                        "content_type": "text",
                        "title": "Rating",
                        "payload": "Rating",
                    },
                    {
                        "content_type": "text",
                        "title": "Talk to live agent",
                        "payload": "Talk to live agent",
                    }];
                    sendQuickReply(sender, intro, replies)
                }, 2000);


            break;


        case "family-friends":

            sendTextMessage(sender,"Do come with your close ones! You all will definitely enjoy the day.");
            
            setTimeout(function() {
                var ff = "Would you like to know more? :)"
                        var replies = [{
                            "content_type": "text",
                            "title": "Opinion",
                            "payload": "Opinion",
                        },
                        {
                            "content_type": "text",
                            "title": "Rating",
                            "payload": "Rating",
                        },
                        {
                            "content_type": "text",
                            "title": "Talk to live agent",
                            "payload": "Talk to live agent",
                        }];
                        sendQuickReply(sender, ff, replies)
                    }, 1500);
            break;

        case "ttp-location":
            
            const locationTTP = [{
                "title": "The Top Penang",
                "subtitle": "Click on the button below to get more information.",
                "imageUrl": "https://i.postimg.cc/v8jXtF2d/location.png",
                "buttons": [
                  {
                    "postback": "https://www.google.com/maps/place/The+Top+Penang/@5.4149899,100.3278325,17z/data=!4m12!1m6!3m5!1s0x304ac395ce63cafb:0x786a38ba7f1ba486!2sThe+Top+Penang!8m2!3d5.4145785!4d100.3299332!3m4!1s0x304ac395ce63cafb:0x786a38ba7f1ba486!8m2!3d5.4145785!4d100.3299332",
                    "text": "View Map"
                  }
                ]
              }];
              
              handleCardMessages(locationTTP, sender)


              setTimeout(function() {
                var afterLocation = "How can I help you today? :)"
                        var replies = [{
                            "content_type": "text",
                            "title": "Opinion",
                            "payload": "Opinion",
                        },
                        {
                            "content_type": "text",
                            "title": "Rating",
                            "payload": "Rating",
                        },
                        {
                            "content_type": "text",
                            "title": "Talk to live agent",
                            "payload": "Talk to live agent",
                        }];
                        sendQuickReply(sender, afterLocation, replies)
                    }, 2500);
            

        break;

        case "implict-word":
            sendTextMessage(sender, "Sorry for disappointing you. I'm still learning.");
            sendPassThread(sender); 
            
        break;

        case "ttp-food":

            sendTextMessage(sender,"Feeling hungry already? ");
            setTimeout(function() {
            sendTextMessage(sender,"The food here will make you happy!");
            }, 1000);
            
            var imgUrl = "https://i.postimg.cc/PrY9KHpw/top-view-english-tea-nov2019.jpg";
            sendImageMessage(sender, imgUrl);
            

            setTimeout(function() {
            var afterFood = "What do you want to know next? :)"
                    var replies = [{
                        "content_type": "text",
                        "title": "Opinion",
                        "payload": "Opinion",
                    },
                    {
                        "content_type": "text",
                        "title": "Rating",
                        "payload": "Rating",
                    },
                    {
                        "content_type": "text",
                        "title": "Talk to live agent",
                        "payload": "Talk to live agent",
                    }];
                    sendQuickReply(sender, afterFood, replies)
                }, 4000);
            break;

        case "what-people-dislike":
            const elementsPeopleDislike = [
                
                {
                  "title": "Too hot",
                  "subtitle": "It's too hot to stay in open space :(",
                  "imageUrl": "https://i.postimg.cc/Y9kmVzBw/hot.png",
                  "buttons": [
                    {
                      "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r736957994-The_TOP_Penang-George_Town_Penang_Island_Penang.html",
                      "text": "View review 1"
                    }, {
                      "text": "View review 2",
                      "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r571682753-The_TOP_Penang-George_Town_Penang_Island_Penang.html"
                    }
                  ]
                }
                ,
                
                {
                  "title": "Expensive",
                  "subtitle": "Ticket is expensive :(",
                  "imageUrl": "https://i.postimg.cc/CxS5wL6j/Too-Expensive-Emoji.jpg",
                  "buttons": [
                    {
                      "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r533279728-The_TOP_Penang-George_Town_Penang_Island_Penang.html",
                      "text": "View review 1"
                    }, {
                      "text": "View review 2",
                      "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r491172247-The_TOP_Penang-George_Town_Penang_Island_Penang.html"
                    }
                  ]
                }
              
              ];
                
                handleCardMessages(elementsPeopleDislike, sender)

                setTimeout(function() {
                    var responseText = "Do you want to know what are the things that past visitors like?"
                    var replies = [{
                        "content_type": "text",
                        "title": "What people like",
                        "payload": "What people like",
                    },
                    {
                        "content_type": "text",
                        "title": "Opinion",
                        "payload": "Opinion",
                    }
                    ];
                sendQuickReply(sender, responseText, replies)
                }, 2000);

            break;

        case "what-people-like":

                if (peopleLike == 1){
            const elementsPeopleLike = [
                
                {
                  "title": "Aquarium",
                  "subtitle": "Learn more about how to conserve our aquatic friends and their homes here.",
                  "imageUrl": "https://i.postimg.cc/1tfNsbDJ/aquarium.jpg",
                  "buttons": [
                    {
                      "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r641500463-The_TOP_Penang-George_Town_Penang_Island_Penang.html",
                      "text": "View review 1"
                    }, {
                      "text": "View review 2",
                      "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r680744437-The_TOP_Penang-George_Town_Penang_Island_Penang.html"
                    },
                    {
                      "text": "View review 3",
                      "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r581214428-The_TOP_Penang-George_Town_Penang_Island_Penang.html"
                                   
                    }
                  ]
                }
                ,
                {
                  "title": "Rainbow Walk",
                  "subtitle": "Get the thrilling experience of walking on air 816 feet above sea level!",
                  "imageUrl": "https://i.postimg.cc/mk7kr4kN/penang-skywalk-night.jpg",
                  "buttons": [
                    {
                      "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r734462577-The_TOP_Penang-George_Town_Penang_Island_Penang.html",
                      "text": "View review 1"
                    }, {
                      "text": "View review 2",
                      "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r528457479-The_TOP_Penang-George_Town_Penang_Island_Penang.html"
                    },
                    {
                      "text": "View review 3",
                      "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r522115914-The_TOP_Penang-George_Town_Penang_Island_Penang.html"
                                   
                    }
                  ]
                }
 
              
              ];
              handleCardMessages(elementsPeopleLike, sender)
            }else {
            

        

            const elementsPeopleLike = [
                     
                {
                "title": "Observatory Deck",
                "subtitle": "Here features a glass walkway that lets you watch the world go by below.",
                "imageUrl": "https://i.postimg.cc/hGYh6SzL/1.png",
                "buttons": [
                  {
                    "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r718605237-The_TOP_Penang-George_Town_Penang_Island_Penang.html",
                    "text": "View review 1"
                  }, {
                    "text": "View review 2",
                    "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r631161230-The_TOP_Penang-George_Town_Penang_Island_Penang.html"
                  },
                  {
                    "text": "View review 3",
                    "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r619064422-The_TOP_Penang-George_Town_Penang_Island_Penang.html"
                                 
                  }
                ]
              },
              {
                "title": "Jurassic Park",
                "subtitle": "Meet and frolic with over 200 dinosaurs from millions of years ago!",
                "imageUrl": "https://i.postimg.cc/T2yL9KwY/1.png",
                "buttons": [
                  {
                    "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r639465386-The_TOP_Penang-George_Town_Penang_Island_Penang.html",
                    "text": "View review 1"
                  }, {
                    "text": "View review 2",
                    "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r684142386-The_TOP_Penang-George_Town_Penang_Island_Penang.html"
                  },
                  {
                    "text": "View review 3",
                    "postback": "https://www.tripadvisor.com.my/ShowUserReviews-g298303-d12206157-r480408473-The_TOP_Penang-George_Town_Penang_Island_Penang.html"
                                 
                  }
                ]
              }
            
            ];
            handleCardMessages(elementsPeopleLike, sender)
        }
            peopleLike = peopleLike + 1;
            if(peopleLike == 3){
                peopleLike =1;
            }
            
              
              

              setTimeout(function() {
                var responseText = "Do you want to see what people dislike as well?"
                var replies = [{
                    "content_type": "text",
                    "title": "What people dislike",
                    "payload": "What people dislike",
                },
                {
                    "content_type": "text",
                    "title": "Opinion",
                    "payload": "Opinion",
                }
                ];
            sendQuickReply(sender, responseText, replies)
            }, 2000);


            break;

        case "ttp-rating":
            sendTextMessage(sender, 'Traveller Overview 4.0/5.0 with 194 reviews.');
            setTimeout(function() {
            sendTextMessage(sender, '⭐⭐⭐⭐⭐ 35%\n' + 
                                    '⭐⭐⭐⭐ 38%\n' +         
                                    '⭐⭐⭐ 16%\n' +
                                    '⭐⭐ 5%\n' +
                                    '⭐ 6%'
                                    )
            }, 1000);
            setTimeout(function() {
                var responseText = "Do you want to know what travellers talk about?"
                var replies = [{
                    "content_type": "text",
                    "title": "What people like",
                    "payload": "What people like",
                },
                {
                    "content_type": "text",
                    "title": "What people dislike",
                    "payload": "What people dislike",
                },
                {
                    "content_type": "text",
                    "title": "Opinion",
                    "payload": "Opinion",
                }
                ];
            sendQuickReply(sender, responseText, replies)
            }, 2000);

            break;

        case "view-more-info-fee":
            sendTextMessage(sender, 'For The Top Fun Pass, it costs RM78 per single adult, and RM48 per child, senior citizen or people with disabilities (OKU) for MyKad holders. For the standard rate (foreigner), it costs RM99 and RM58 respectively.');
            setTimeout(function() {
                sendTextMessage(sender,'For MyKad holders, The Top Rainbow Skywalk costs RM48 per adult and RM28 per child, senior citizen or people with disabilities (OKU). Meanwhile, for foreigners, it costs RM68 per adult and RM48 per child, senior citizen or OKU.');
            }, 1000);
            //sendTextMessage(sender,'For MyKad holders, The Top Rainbow Skywalk costs RM48 per adult and RM28 per child, senior citizen or people with disabilities (OKU). Meanwhile, for foreigners, it costs RM68 per adult and RM48 per child, senior citizen or OKU.');
            setTimeout(function() {
                let buttons = [
                    {
                        type:"postback",
                        payload:"THE_TOP_FUN_PASS",
                        title:"The Top Fun Pass"
                    },
                    {
                        type:"postback",
                        title:"The Top Rainbow Skywalk",
                        payload:"RAINBOW_SKYWALK",
                    },
                    {
                        type:"postback",
                        title:"Another Opinion",
                        payload:"ANOTHER_OPINION"
                    }
                ];

                sendButtonMessage(sender, "Which one do you prefer?", buttons);
            }, 1500)
                        
            break;

        case "ttp-comparative":
           /* ttp.readAllOpinions(function (allOpinions) { 
                let reply = `${messages[0].text.text} ${allOpinions[ttp_comparative]}`; 
                sendTextMessage(sender, reply);
                ttp_comparative = ttp_comparative + 1;
                if(ttp_comparative==2){
                    ttp_comparative = 0;
                } 
                //let a = "okokoko wow";
                //sendTextMessage(sender, a);
                sendToDialogFlow(sender, 'post com');

            });*/
            //let touristMessage ='';
            let reply ='';
            let replyLink ='';

           /* if(touristSays ==1){
                touristMessage = 'A visitor mentioned that ';
                touristSays = touristSays + 1;
            }
            else if (touristSays == 2){
                touristMessage = 'One of the travellers told us ';
                touristSays = touristSays + 1;
            }
            else if (touristSays == 3){
                touristMessage = 'A past The Top Penang visitor explained that ';
                touristSays = touristSays + 1;
            }
            else {
                touristMessage ='A past tourist claimed that ';
                touristSays = touristSays + 1;
            }
            if (touristSays ==5){
                touristSays =1;
            }*/
            var touristMessage = max.articulate("preSentence");
            //var emoji_directory = max.articulate("emoji");
            
            if(ttp_comparative ==0){
                reply = 'the views from The Top of Komtar are far better than that experienced from the top of Penang Hill.🌆';
                replyLink = 't.ly/LX980';
                ttp_comparative = ttp_comparative + 1;

                //Ajaj🌅🎁jkJks🌆🌄jsjka
            
            }
            else{
                reply ='there are lots of souvenir shops there but price will be a bit higher than Penang road there.🎁';
                replyLink = 't.ly/1VJdB';
                ttp_comparative = ttp_comparative + 1;
                
                
            }
            if(ttp_comparative==2){
                ttp_comparative = 0;
            }
            let replyComparative = touristMessage + reply; 
            let replyLinkComparative = "🔗Original review: " + replyLink;
            sendTextMessage(sender, replyComparative );
            setTimeout(function() {
                sendTextMessage(sender, replyLinkComparative );
            }, 1000);
            
            if(ttp_comparative ==1){
                setTimeout(function() {
                    var responseText = "What do you want to do next?"
                    var replies = [{
                        "content_type": "text",
                        "title": "Next comparative",
                        "payload": "Next comparative",
                    },
                    {
                        "content_type": "text",
                        "title": "guidance",
                        "payload": "guidance",
                    },
                    {
                        "content_type": "text",
                        "title": "fee",
                        "payload": "fee",
                    },
                    {
                        "content_type": "text",
                        "title": "time",
                        "payload": "time",
                    },
                    {
                        "content_type": "text",
                        "title": "directory",
                        "payload": "directory",
                    },
                    {
                        "content_type": "text",
                        "title": "rating",
                        "payload": "rating",
                    }];
                sendQuickReply(sender, responseText, replies)
                }, 2200);
            }
            else {
                setTimeout(function() {
                    var responseText = "What do you want to know next?"
                    var replies = [
                    {
                        "content_type": "text",
                        "title": "guidance",
                        "payload": "guidance",
                    },
                    {
                        "content_type": "text",
                        "title": "fee",
                        "payload": "fee",
                    },
                    {
                        "content_type": "text",
                        "title": "time",
                        "payload": "time",
                    },
                    {
                        "content_type": "text",
                        "title": "directory",
                        "payload": "directory",
                    },
                    {
                        "content_type": "text",
                        "title": "rating",
                        "payload": "rating",
                    }];
                    sendQuickReply(sender, responseText, replies)
                }, 3000);
            }
            
            break;

            case "ttp-directory":
                var ps_directory = max.articulate("preSentence");
                var emoji_directory = max.articulate("emoji");
                //sendTextMessage(sender, a5);
                
                    ttp.readAllOpinions(function (allOpinions) { 
                        //let reply = `${messages[0].text.text} ${allOpinions[ttp_directory]}`; 
                        let reply = `${allOpinions[ttp_directory]}`;
                        let reply2 = ps_directory + reply + emoji_directory;
                        sendTextMessage(sender, reply2);
                                          
                    });


                
                

                setTimeout(function() {
                    ttp.readLink(function (allLink) { 
                        let replyLink = `🔗Original review: ${allLink[ttp_directory]}`; 
                            sendTextMessage(sender, replyLink);

                
            }                   
            );
        }, 1000);
                
                setTimeout(function() {
                    ttp_directory = ttp_directory + 1;
                    if(ttp_directory==9){
                        ttp_directory = 2;
                    } 

                }, 1500);
                    
                    
                    
                  

                setTimeout(function() {
                    if (ttp_directory == 2 || ttp_directory == 4 || ttp_directory == 6 ){
                        var responseText = "What do you want to know more about?"
                    }
                    else var responseText = "Which one do you prefer to see next?"
                    
                    var replies = [
                        {
                            "content_type": "text",
                            "title": "next directory",
                            "payload": "next directory",
                        },
                        {
                            "content_type": "text",
                            "title": "rating",
                            "payload": "rating",
                        },
                        {
                            "content_type": "text",
                            "title": "guidance",
                            "payload": "guidance",
                        },
                        {
                            "content_type": "text",
                            "title": "time",
                            "payload": "time",
                        },
                        {
                            "content_type": "text",
                            "title": "fee",
                            "payload": "fee",
                        }];
                        sendQuickReply(sender, responseText, replies)
                }, 3000);               
                break;

            case "ttp-fee":
                /*ttp.readAllOpinions(function (allOpinions) { 
                    let reply = `${messages[0].text.text} ${allOpinions[ttp_fee]}`; 
                    sendTextMessage(sender, reply);
                    ttp_fee = ttp_fee + 1;
                    if(ttp_fee==11){
                        ttp_fee = 9;
                    } 
                    //sendToDialogFlow(sender, 'fmi_card');   

                 });*/



                 sendTextMessage(sender, 'You can get your ticket at level 5 or purchase it online. There are two types of tickets, such as The Top Fun Pass (Multiple Entries) and The Top Rainbow Skywalk (Single Entry).');
                 //sendTextMessage(sender, 'The Top Fun Pass allows multiple entries on a same-day visit to all attractions in the Avenue of Adventures and Rainbow Skywalk at The Top Penang except Augmented Reality Virtual, Formula One, The Gravityz & TOP Capsule.');
                 setTimeout(function() {
                    sendTextMessage(sender, 'The Top Fun Pass allows multiple entries on a same-day visit to all attractions in the Avenue of Adventures and Rainbow Skywalk at The Top Penang.');
                 
                }, 1000);

                setTimeout(function() {
                    if(fee_opinion == 1)
                    sendTextMessage(sender, 'A past visitor expressed that their price is quite reasonable.');
                    else if(fee_opinion == 2)
                    sendTextMessage(sender, 'One of the tourists mentioned that ticket price is reasonable enough for ordinary people to afford.');
                    else 
                    sendTextMessage(sender, 'A traveller said this is an affordable place to visit.');
                    fee_opinion=fee_opinion + 1;
                    if(fee_opinion==4)
                    fee_opinion=1;
                }, 1500);
                 
                 
                 /*var responseText = "What do you want to do next?"
                 var replies = [{
                     "content_type": "text",
                     "title": "View more info",
                     "payload": "View more info",
                 },
                 {
                     "content_type": "text",
                     "title": "Another Opinion",
                     "payload": "ANOTHER_OPINION",
                 },
                 {
                     "content_type": "text",
                     "title": "Rating",
                     "payload": "Example 3",
                 }];
                 sendQuickReply(sender, responseText, replies)*/
                 
                 
                 //https://i.postimg.cc/Sx9ZFkcn/Rainbow-Walk-2.jpg
/*
                 const elements = [{
                    "title": "The Top Fun Pass",
                    "subtitle": "Discover more than 18 themed attractions in one iconic destination!",
                    "imageUrl": "https://i.postimg.cc/XYNMnZ7r/Jurassic-Research-Center-Gallery-5.jpg",
                    "buttons": [
                      {
                        "postback": "https://thetop.com.my/",
                        "text": "View Website"
                      }, {
                        "text": "Purchase Ticket Now",
                        "postback": "https://onlyticket.com.my/selection/110"
                      },
                      {
                        "text": "Another Opinion",
                        "postback": "ANOTHER_OPINION"
                                     
                      }
                    ]
                  }];
                  console.log("here hereeeeeeeeeeeeeeee1");
                  handleCardMessages(elements, sender)
                 

*/
                setTimeout(function() {
                    let buttons = [
                        {   
                            type:"postback",
                            payload:"VIEW_MORE_INFO_FEE",
                            title:"💵More Price Info"
                        },
                        {
                            type:"postback",
                            title:"💡Another Opinion",
                            payload:"ANOTHER_OPINION",
                        },
                        {
                            type:"postback",
                            title:"⭐Rating",
                            payload:"RATING"
                        }
                    ];

                    sendButtonMessage(sender, "What would you like to do next?", buttons);
                }, 2000)


                break;

            case "ttp-guidance":
                var ps_guidance = max.articulate("preSentence");
                var emoji_guidance = max.articulate("emoji");

                ttp.readAllOpinions(function (allOpinions) { 
                    
                   // let reply = `${messages[0].text.text} ${allOpinions[ttp_guidance]}`; 

                let reply = `${allOpinions[ttp_guidance]}`;
                let reply2 = ps_guidance + reply + emoji_guidance;
                sendTextMessage(sender, reply2);
                                      
                });

                setTimeout(function() {
                    ttp.readLink(function (allLink) { 
                        let replyLink = `🔗Original review: ${allLink[ttp_guidance]}`; 
                            sendTextMessage(sender, replyLink);
                       
                        
                                        
                    });

                }, 1000);

                

                setTimeout(function() {
                    ttp_guidance = ttp_guidance + 1;
                    if(ttp_guidance==25){
                        ttp_guidance = 11;
                    }   
                }, 1500);

                setTimeout(function() {
                    if (ttp_guidance == 11 || ttp_guidance == 14 || ttp_guidance == 17 || ttp_guidance == 20 || ttp_guidance == 23){
                        var responseText = "Do you want to look at the next guidance or other information?"
                    }
                    else if (ttp_guidance == 12 || ttp_guidance == 15 || ttp_guidance == 18 || ttp_guidance == 21 || ttp_guidance == 24 ){
                        var responseText = "Are you interested in other opinon as well?"

                    } else var responseText = "Which one do you want to know next?";
                    
                    var replies = [
                        {
                            "content_type": "text",
                            "title": "next guidance",
                            "payload": "next guidance",
                        },
                        {
                            "content_type": "text",
                            "title": "rating",
                            "payload": "rating",
                        },
                        {
                            "content_type": "text",
                            "title": "directory",
                            "payload": "directory",
                        },
                        {
                            "content_type": "text",
                            "title": "comparative",
                            "payload": "comparative",
                        },
                        {
                            "content_type": "text",
                            "title": "time",
                            "payload": "time",
                        },
                        {
                            "content_type": "text",
                            "title": "fee",
                            "payload": "fee",
                        }];
                        sendQuickReply(sender, responseText, replies)
                }, 3000); 


                break;

            case "ttp-time":

                var ps_time = max.articulate("preSentence");
                var emoji_time = max.articulate("emoji");

                   /* setTimeout(function() {
                        
                    }, 1500);*/
                    sendTextMessage(sender, "Operation hours: 11.00am to 11.00pm (everyday)⏰ 10.00am to 10.00pm (Malaysia School and Public Holiday)⏰");
                
                    ttp.readAllOpinions(function (allOpinions) { 
                        
                        //let reply = `${messages[0].text.text} ${allOpinions[ttp_time]}`; 
                        let reply = `${allOpinions[ttp_time]}`;
                        let reply2 = ps_time + reply + emoji_time;
                        sendTextMessage(sender, reply2);
                        
                         
                });

                
                
                
                    setTimeout(function() {
                        ttp.readLink(function (allLink) { 
                            
                            let replyLink = `🔗Original review: ${allLink[ttp_time]}`; 
                            sendTextMessage(sender, replyLink);
                    
                });

                    }, 1000);

                    setTimeout(function() {
                        ttp_time = ttp_time + 1;
                        if(ttp_time==32){
                            ttp_time = 25;
                        }

                    }, 1500);

                    
                    
            

                setTimeout(function() {
                    if (ttp_time == 25 || ttp_time == 27 || ttp_time == 29 || ttp_time == 31){
                        var responseText = "What can I offer you next?"
                    }
                    else var responseText = "Do you want to know more about other opinion?";
                    
                    var replies = [
                        {
                            "content_type": "text",
                            "title": "next time opinion",
                            "payload": "next time opinion",
                        },
                        {
                            "content_type": "text",
                            "title": "directory",
                            "payload": "directory",
                        },
                        {
                            "content_type": "text",
                            "title": "comparative",
                            "payload": "comparative",
                        },
                        {
                            "content_type": "text",
                            "title": "guidance",
                            "payload": "guidance",
                        },
                        {
                            "content_type": "text",
                            "title": "fee",
                            "payload": "fee",
                        },
                        {
                            "content_type": "text",
                            "title": "rating",
                            "payload": "rating",
                        }];
                        sendQuickReply(sender, responseText, replies)
                }, 3000); 



            break;
            
        case "talk.human":
            sendPassThread(sender); 
            break;

        case "get-current-weather":
            //first check if geo-city paramter is set up. If paramters has geo-city and if it is not empty, then call service
        	if ( parameters.fields.hasOwnProperty('geo-city') && parameters.fields['geo-city'].stringValue!='') {
            	request({
					url: 'http://api.openweathermap.org/data/2.5/weather', //URL to hit
                	qs: { //pass in query part paramter and appId parameter
                		appid: config.WEATHER_API_KEY,
						q: parameters.fields['geo-city'].stringValue //query string for city (got from dialogflow parameter)
                	}, //Query string data
            	}, function(error, response, body){
					if( response.statusCode === 200) { //if response code is 200, means request was successful
                        //parse the json from the response
                    	let weather = JSON.parse(body);
                    	if (weather.hasOwnProperty("weather")) {
                        	let reply = `${messages[0].text.text} ${weather["weather"][0]["description"]}`; //the reply becomes the description in the weather array
                        	sendTextMessage(sender, reply);
                    	} else {
                        	sendTextMessage(sender,
								`No weather forecast available for ${parameters.fields['geo-city'].stringValue}`);
                        }
                    } else {
						sendTextMessage(sender, 'Weather forecast is not available');
                    }
                });
            } else {
            	handleMessages(messages, sender); //cant call service jiu send response back to fb (user not enter the city, the bot will send question asking for city)
            }
            break;
            
        case "faq-delivery":

            handleMessages(messages, sender); //display the speech response we got from dialogflow

            sendTypingOn(sender); //wait 2 seconds and in the meantime show typing indicator

            //ask what user wants to do next
            setTimeout(function() {
                let buttons = [
                    {
                        type:"web_url",
                        url:"https://www.malaysiastock.biz/Latest-Announcement.aspx",
                        title:"Track my order"
                    },
                    {
                        type:"phone_number",
                        title:"Call us",
                        payload:"+16505551234",
                    },
                    {
                        type:"postback",
                        title:"Keep on Chatting",
                        payload:"CHAT"
                    }
                ];

                sendButtonMessage(sender, "What would you like to do next?", buttons);
            }, 2000)

        break;
/*
        case "detailed-application": //catch detailed-application action and then check for context
            let filteredContexts = contexts.filter(function (el) { //filter the context and see if there is a job_application context among them or job-application-details_dialog_context
                return el.name.includes('job_application') || //get filteredcontexts array of these two if they exist
                    el.name.includes('job-application-details_dialog_context')
            });
            if (filteredContexts.length > 0 && contexts[0].parameters) { //if length of filterContexts >0 and have array of paramters, then start checking if the parameters are collected.
                //at the beginning parameters will be all empty
                let user_name = (isDefined(contexts[0].parameters.fields['user-name'])
                    && contexts[0].parameters.fields['user-name'] != '') ? contexts[0].parameters.fields['user-name'].stringValue : '';
                
                let previous_job = (isDefined(contexts[0].parameters.fields['previous-job'])
                    && contexts[0].parameters.fields['previous-job'] != '') ? contexts[0].parameters.fields['previous-job'].stringValue : '';            
                
                let years_of_experience = (isDefined(contexts[0].parameters.fields['years-of-experience'])
                    && contexts[0].parameters.fields['years-of-experience'] != '') ? contexts[0].parameters.fields['years-of-experience'].stringValue : '';
                
                let job_vacancy = (isDefined(contexts[0].parameters.fields['job-vacancy'])
                    && contexts[0].parameters.fields['job-vacancy'] != '') ? contexts[0].parameters.fields['job-vacancy'].stringValue : '';
            }
            if (user_name != '' && previous_job != '' && years_of_experience != '' && job_vacancy != '') {

                let emailContent = 'A new job enquiery from ' + user_name + ' for the job: ' + job_vacancy +
                '.<br> Previous job position: ' + previous_job + '.' +
                '.<br> Years of experience: ' + years_of_experience + '.';
              
            sendEmail('New job application', emailContent);

            handleMessages(messages, sender); //after sent email will also send response message back to messenger

            } else {
                    handleMessages(messages, sender); //we need to send response back to messenger with a question for the next paramter
            }
                
            break;*/
        default:
            //unhandled action, just send back the text
            handleMessages(messages, sender);
            setTimeout(function() {
                if (casualQuickReplies == 1){
                    var responseGreet = "What would you choose next? :)"
                    var replies = [{
                        "content_type": "text",
                        "title": "Opinion",
                        "payload": "Opinion",
                    },
                    {
                        "content_type": "text",
                        "title": "Rating",
                        "payload": "Rating",
                    },
                    {
                        "content_type": "text",
                        "title": "Talk to live agent",
                        "payload": "Talk to live agent",
                    }];
                    sendQuickReply(sender, responseGreet, replies)
                }else if (casualQuickReplies == 2)
                {
                    var responseGreet = "Pick one and let me clear your doubt xD"
                    var replies = [{
                        "content_type": "text",
                        "title": "Opinion",
                        "payload": "Opinion",
                    },
                    {
                        "content_type": "text",
                        "title": "Rating",
                        "payload": "Rating",
                    },
                    {
                        "content_type": "text",
                        "title": "Talk to live agent",
                        "payload": "Talk to live agent",
                    }];
                    sendQuickReply(sender, responseGreet, replies)
                }else {

                    var responseGreet = "Which one do you like?"
                    var replies = [{
                        "content_type": "text",
                        "title": "Opinion",
                        "payload": "Opinion",
                    },
                    {
                        "content_type": "text",
                        "title": "Rating",
                        "payload": "Rating",
                    },
                    {
                        "content_type": "text",
                        "title": "Talk to live agent",
                        "payload": "Talk to live agent",
                    }];
                    sendQuickReply(sender, responseGreet, replies)
                }
            }, 2000)

            setTimeout(function(){
                casualQuickReplies = casualQuickReplies + 1;
                if(casualQuickReplies == 4 ){
                    casualQuickReplies = 1;
                }
            }, 3000)

            // Create "max", a new Dog persona.
        //let max = new Dog();
        //console.log("hihihihihihihihihihihihihihhihihijihih");
        
            
    }
}

function handleMessage(message, sender) {
    switch (message.message) {
        case "text": //text
            message.text.text.forEach((text) => {
                if (text !== '') {
                    sendTextMessage(sender, text); //display all the messages 
                }
            });
            break;
        case "quickReplies": //quick replies
            let replies = [];
            message.quickReplies.quickReplies.forEach((text) => {
                let reply =
                    {
                        "content_type": "text",
                        "title": text,
                        "payload": text
                    }
                replies.push(reply);
            });
            sendQuickReply(sender, message.quickReplies.title, replies); //use this method to send quick replies
            break;
        case "image": //send image
            sendImageMessage(sender, message.image.imageUri);
            break;
    }
}


function handleCardMessages(messages, sender) {
    //console.log("here hereeeeeeeeeeeeeeee2");
    /*let elements = [];
    for (var m = 0; m < messages.length; m++) {
        let message = messages[m];
        let buttons = [];
        for (var b = 0; b < message.card.buttons.length; b++) {
            let isLink = (message.card.buttons[b].postback.substring(0, 4) === 'http');
            let button;
            if (isLink) {
                button = {
                    "type": "web_url",
                    "title": message.card.buttons[b].text,
                    "url": message.card.buttons[b].postback
                }
            } else {
                button = {
                    "type": "postback",
                    "title": message.card.buttons[b].text,
                    "payload": message.card.buttons[b].postback
                }
            }
            buttons.push(button);
        }


        let element = {
            "title": message.card.title,
            "image_url":message.card.imageUri,
            "subtitle": message.card.subtitle,
            "buttons": buttons
        };
        elements.push(element);
    }*/
    let elements = [];
  for (var m = 0; m < messages.length; m++) {
    let message = messages[m];
    let buttons = [];
    for (var b = 0; b < message.buttons.length; b++) {
      let isLink = message.buttons[b].postback.substring(0, 4) === "http";
      let button;
      if (isLink) {
        button = {
          type: "web_url",
          title: message.buttons[b].text,
          url: message.buttons[b].postback
        };
      } else {
        button = {
          type: "postback",
          title: message.buttons[b].text,
          payload: message.buttons[b].postback
        };
      }
      buttons.push(button);
    }
    let element = {
      title: message.title,
      image_url: message.imageUrl,
      subtitle: message.subtitle,
      buttons: buttons
    };
    elements.push(element);
  }
    //console.log("here hereeeeeeeeeeeeeeee3");
    sendGenericMessage(sender, elements);
}

//loop thru all the messages and check for the message type
function handleMessages(messages, sender) {
    let timeoutInterval = 1100;
    let previousType ;
    let cardTypes = [];
    let timeout = 0;
    for (var i = 0; i < messages.length; i++) {
      
        //check if the previous message was card so that it can display a gallery. If the previous was card and now this one is not, means the gallery is over and we need to display it
        if ( previousType == "card" && (messages[i].message != "card" || i == messages.length - 1)) {
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);//if the type of message is card, call the handleCardMessage
            cardTypes = []; 
            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        } //if the message is card and it is the last message that arrived from dialogflow, then display the gallery
        else if ( messages[i].message == "card" && i == messages.length - 1) {
            cardTypes.push(messages[i]);
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
        } else if ( messages[i].message == "card") { //if this message is card, then push it to the card gallery
            cardTypes.push(messages[i]);
        } else  {
            //if the message is text or any other type , call handleMessage
            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        }

        previousType = messages[i].message;

    }
}

//get the response text and data
function handleDialogFlowResponse(sender, response) {
    let responseText = response.fulfillmentMessages.fulfillmentText;

    let messages = response.fulfillmentMessages;
    let action = response.action; //if there is a corresponding action and  
    let contexts = response.outputContexts; //if we were in the middle of any kind of dialog, that is if there is a dialog context
    let parameters = response.parameters; //we can also see the parameters, that were read from the conversation

    sendTypingOff(sender);

    //check sentiment before doing anything else
    let textSentiment = sentimentService.getUserSentiment(sender); //get user sentiment from userSentiment map
    let keys = Object.keys(textSentiment); //to get the last sentiment from all of them, so now read the keys of the object. Keys are timestamps of the sentiment.

    let lastSentiment = textSentiment[keys[keys.length - 1]];//the last key is the last sentiment. Since timestamp is a number, it will be in the right order.
    let beforeSentiment = textSentiment[keys[keys.length - 2]];

    let differenceInScore = (beforeSentiment === undefined) ? 0 : Math.abs(beforeSentiment.score - lastSentiment.score);
    
    //look at the score of the last sentiment, also check if the last sentiment exists
       /* console.log("lastSentiment.score is "+ lastSentiment.score);
        console.log("differenceInScore is "+ differenceInScore);
        console.log("beforeSentiment.score is "+ beforeSentiment.score);*/

    //check if there is more than one sentiment, difference is 3 or more, last sentiment is negative but still not so negative
    /*if (lastSentiment!==undefined && differenceInScore>4 && lastSentiment.score<0 && lastSentiment.score >-3){
        sendTextMessage(sender, 'Did I say something wrong ? ' + 
        'The live agent will be here ASAP to find out how we can serve you better.');
        sendPassThread(sender);//pass the control
    }
    else */
    
    
    // ==================================testing start here==================================

    /*if(lastSentiment!==undefined && lastSentiment.score < -4){ //if the score < -2, pass the control to human
        sendTextMessage(sender, 'I sense you are not satisfied with my answer. ' + 
        'Let me call the live agent for you. He should be here ASAP.');

        console.log("lastSentiment is "+ lastSentiment);
        console.log("lastSentiment.score is "+ lastSentiment.score);
        sendPassThread(sender);//pass the control} */

        /*console.log("beforeSentiment is "+ beforeSentiment);
        console.log("beforeSentiment.score is "+ beforeSentiment.score);
        console.log("textSentiment is "+ textSentiment);
        console.log("textSentiment.score is "+ textSentiment.score);*/

        
    
    //else 
    
    // ==================================testing end here==================================
    
        /*if (lastSentiment!==undefined ){ //if the score < -2, pass the control to human
        sendTextMessage(sender, 'I sense you are not satisfied with my answer. ' + 
        'Let me call my boss for you. He should be here ASAP.');
        console.log("lastSentiment is " + lastSentiment);
        console.log("sssssssssssentiment score is " + lastSentiment.score);
        console.log("textSentiment is " + textSentiment.score);
        sendPassThread(sender);//pass the control
    }*/


 
    
    if (isDefined(action)) { //if action is defined, then see what it is and handle it
        handleDialogFlowAction(sender, action, messages, contexts, parameters); //if dialogflow returns an intent, that has an action set, then call the handleDialogFlowAction
       // nextPossibleQuestion(sender);
        //console.log("1111111111111");
        //hi
        //haha
        //time, fee
        //i cannot understand
    } else if (isDefined(messages)) { //if there is no action, we need to handle messages we received from Dialogflow
        handleMessages(messages, sender);//the responses we set in dialogflow will be handle in handleMessages method
      //  nextPossibleQuestion(sender);
        //console.log("2222222222222222");
    } else if (responseText == '' && !isDefined(action)) {
        //dialogflow could not evaluate input. If there was error and we didnt get any data, than we still provide an answer to the user
        sendTextMessage(sender, "I'm not sure what you want. Can you be more specific?"); //this will only happen if you dont hv the default fallback intent
       // nextPossibleQuestion(sender);
        //console.log("333333333333333");
    } else if (isDefined(responseText)) {
        sendTextMessage(sender, responseText);
        //nextPossibleQuestion(sender); 
       // console.log("444444444444444");
    }

    function lowSentimentPassControl (){
        //to pass conversation control from chatbot to a live agent
    }
}

//function that makes a request to dialogflow
async function sendToDialogFlow(sender, textString, params) {

    sendTypingOn(sender); //2.) after we have have the proper session, we set typing on. This function tells messenger to show dots, as if someone is typing

    try { //1.) firstly set the approriate session, so dialogflow can track conversation with this particular user
        const sessionPath = sessionClient.sessionPath(
            config.GOOGLE_PROJECT_ID,
            sessionIds.get(sender) //track by its session, so pass in the sender id
        );                         //we get userid from sessionid, and we also pass in google project id
            
        //3.) then we make the text request, sends text to dialogflow
        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: textString,
                    languageCode: config.DF_LANGUAGE_CODE,
                },
            },
            queryParams: {
                payload: {
                    data: params
                }
            }
        };
        const responses = await sessionClient.detectIntent(request); //we wait for response

        const result = responses[0].queryResult; //when it happens, we handle it
        handleDialogFlowResponse(sender, result); //dialogflow get the response for us
    } catch (e) {
        console.log('error');
        console.log(e);
    }

}




function sendTextMessage(recipientId, text) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text
        }
    }
    callSendAPI(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId, imageUrl) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: imageUrl
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: config.SERVER_URL + "/assets/instagram_logo.gif"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "audio",
                payload: {
                    url: config.SERVER_URL + "/assets/sample.mp3"
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example videoName: "/assets/allofus480.mov"
 */
function sendVideoMessage(recipientId, videoName) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "video",
                payload: {
                    url: config.SERVER_URL + videoName
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example fileName: fileName"/assets/test.txt"
 */
function sendFileMessage(recipientId, fileName) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "file",
                payload: {
                    url: config.SERVER_URL + fileName
                }
            }
        }
    };

    callSendAPI(messageData);
}



/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId, text, buttons) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: text,
                    buttons: buttons
                }
            }
        }
    };

    callSendAPI(messageData);
}


function sendGenericMessage(recipientId, elements) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: elements
                }
            }
        }
    };
    //console.log("here hereeeeeeeeeeeeeeee4");

    callSendAPI(messageData);
}


function sendReceiptMessage(recipientId, recipient_name, currency, payment_method,
                            timestamp, elements, address, summary, adjustments) {
    // Generate a random receipt ID as the API requires a unique ID
    var receiptId = "order" + Math.floor(Math.random() * 1000);

    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "receipt",
                    recipient_name: recipient_name,
                    order_number: receiptId,
                    currency: currency,
                    payment_method: payment_method,
                    timestamp: timestamp,
                    elements: elements,
                    address: address,
                    summary: summary,
                    adjustments: adjustments
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId, text, replies, metadata) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text,
            metadata: isDefined(metadata)?metadata:'',
            quick_replies: replies
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "mark_seen"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {


    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {


    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Welcome. Link your account.",
                    buttons: [{
                        type: "account_link",
                        url: config.SERVER_URL + "/authorize"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v3.2/me/messages',
        qs: {
            access_token: config.FB_PAGE_TOKEN
        },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            if (messageId) {
                console.log("Successfully sent message with id %s to recipient %s",
                    messageId, recipientId);
            } else {
                console.log("Successfully called Send API for recipient %s",
                    recipientId);
            }
        } else {
            console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
        }
    });
}



/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
//the payload field in the callback is defined on the button
function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    setSessionAndUser(senderID); //session and user should be set if the user's first action is sending text and also if they click on the button in persistant menu

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    //In this switch statement, add action for any clicks on the button, that is postbacks
    switch (payload) {

        case 'RATING':
            sentimentService.addUserSentiment(senderID, 'rating');
            sendToDialogFlow(senderID,'rating');
            break;

        case 'WHAT_PEOPLE_LIKE':
            sentimentService.addUserSentiment(senderID, 'what poeple like');
            sendToDialogFlow(senderID,'What people like');
            break;

        case 'WHAT_PEOPLE_DISLIKE':
            sentimentService.addUserSentiment(senderID, 'what poeple dislike');
            sendToDialogFlow(senderID,'What people dislike');
            break;

        case 'TALK_TO_HUMAN':
            sentimentService.addUserSentiment(senderID, 'talk to human');
            sendPassThread(senderID); 
            break;

        case 'TAKE_THREAD_CONTROL':
            takeThreadControl(senderID);
            break;


        case 'TIME':
            sentimentService.addUserSentiment(senderID, 'time');
            sendToDialogFlow(senderID, 'time');
            break;
        
        case 'COMPARATIVE':
            sentimentService.addUserSentiment(senderID, 'comparative');
            sendToDialogFlow(senderID, 'comparative');
            break;

        case 'GUIDANCE':
            sentimentService.addUserSentiment(senderID, 'guidance');
            sendToDialogFlow(senderID, 'guidance');
            break;

        case 'FEE':
            sentimentService.addUserSentiment(senderID, 'fee');
            sendToDialogFlow(senderID, 'fee');
            break;

        case 'DIRECTORY':
            sentimentService.addUserSentiment(senderID, 'directory');
            sendToDialogFlow(senderID, 'directory');
            break;


        case 'THE_TOP_FUN_PASS':
            sentimentService.addUserSentiment(senderID, 'fun');
            const elementsTopFunPass = [{
                "title": "The Top Fun Pass",
                "subtitle": "Discover more than 18 themed attractions in one iconic destination!",
                "imageUrl": "https://i.postimg.cc/XYNMnZ7r/Jurassic-Research-Center-Gallery-5.jpg",
                "buttons": [
                  {
                    "postback": "https://thetop.com.my/",
                    "text": "View Website"
                  }, {
                    "text": "Purchase Ticket Now",
                    "postback": "https://onlyticket.com.my/selection/110"
                  },
                  {
                    "text": "Another Opinion",
                    "postback": "ANOTHER_OPINION"
                                 
                  }
                ]
              }];
              
              handleCardMessages(elementsTopFunPass, senderID)
            break;

        case 'RAINBOW_SKYWALK':
            sentimentService.addUserSentiment(senderID, 'rainbow');
            const elementsRainbowSkywalk = [{
                "title": "The Top Rainbow Skywalk",
                "subtitle": "Here offers stunning seamless views of George Town and beyond!",
                "imageUrl": "https://i.postimg.cc/Sx9ZFkcn/Rainbow-Walk-2.jpg",
                "buttons": [
                  {
                    "postback": "https://thetop.com.my/",
                    "text": "View Website"
                  }, {
                    "text": "Purchase Ticket Now",
                    "postback": "https://onlyticket.com.my/selection/110"
                  },
                  {
                    "text": "Another Opinion",
                    "postback": "ANOTHER_OPINION"
                                 
                  }
                ]
              }];
              
              handleCardMessages(elementsRainbowSkywalk, senderID)
            break;


        case 'VIEW_MORE_INFO_FEE':
            sentimentService.addUserSentiment(senderID, 'more price info');
            sendToDialogFlow(senderID, 'vmif123');
            break;


        case 'ANOTHER_OPINION':
            sentimentService.addUserSentiment(senderID, 'opinion');
            var responseText = "Choose an option below :) "
            var replies = [{
                "content_type": "text",
                "title": "time",
                "payload": "time",
            },
            {
                "content_type": "text",
                "title": "directory",
                "payload": "directory",
            },
            {
                "content_type": "text",
                "title": "comparative",
                "payload": "comparative",
            },
            {
                "content_type": "text",
                "title": "guidance",
                "payload": "guidance",
            },
            {
                "content_type": "text",
                "title": "rating",
                "payload": "rating",
            }];
            sendQuickReply(senderID, responseText, replies)
            break;

        case 'GET_STARTED':
            sentimentService.addUserSentiment(senderID, 'start');
            greetUserText(senderID);
            break;


        default:
            //unindentified payload
            sendTextMessage(senderID, "I'm not sure what you want. Can you be more specific?");
            break;

    }

    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

}


/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
//this function get the relevent data from the request and log them into the console
//also do the same logging in receivedAuthentication, receivedDeliveryConfirmation, receivedMessageRead and in receiveAccountLink
function receivedMessageRead(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    // All messages before watermark (a timestamp) or sequence have been seen.
    var watermark = event.read.watermark;
    var sequenceNumber = event.read.seq;

    console.log("Received message read event for watermark %d and sequence " +
        "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
function receivedAccountLink(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    var status = event.account_linking.status;
    var authCode = event.account_linking.authorization_code;

    console.log("Received account link event with for user %d with status %s " +
        "and auth code %s ", senderID, status, authCode);
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var delivery = event.delivery;
    var messageIDs = delivery.mids;
    var watermark = delivery.watermark;
    var sequenceNumber = delivery.seq;

    if (messageIDs) {
        messageIDs.forEach(function (messageID) {
            console.log("Received delivery confirmation for message ID: %s",
                messageID);
        });
    }

    console.log("All message before %d were delivered.", watermark);
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfAuth = event.timestamp;

    // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
    // The developer can set this to an arbitrary value to associate the
    // authentication callback with the 'Send to Messenger' click event. This is
    // a way to do account linking when the user clicks the 'Send to Messenger'
    // plugin.
    var passThroughParam = event.optin.ref;

    console.log("Received authentication for user %d and page %d with pass " +
        "through param '%s' at %d", senderID, recipientID, passThroughParam,
        timeOfAuth);

    // When an authentication is received, we'll send a message back to the sender
    // to let them know it was successful.
    sendTextMessage(senderID, "Authentication successful");
}

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
//here validate the request came from fb, and from the right aplication
function verifyRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"]; //read the signature from the request's header

    if (!signature) {
        throw new Error('Couldn\'t validate the signature.'); //if ther is no signature, throw an error
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = crypto.createHmac('sha1', config.FB_APP_SECRET) //compare the signaturehash with the encryted app secret from the config file
            .update(buf)
            .digest('hex');

        if (signatureHash != expectedHash) { //if doesn't match, will throw an error
            throw new Error("Couldn't validate the request signature.");
        }
    }
}

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}

function nextPossibleQuestion(sender){
    setTimeout(function() {
        var responseGreet = "What do you want to do next?"
             var replies = [{
                 "content_type": "text",
                 "title": "Opinion",
                 "payload": "Opinion",
             },
             {
                 "content_type": "text",
                 "title": "Rating",
                 "payload": "Rating",
             },
             {
                 "content_type": "text",
                 "title": "Talk to live agent",
                 "payload": "Talk to live agent",
             }];
             sendQuickReply(sender, responseGreet, replies)
    }, 1000);
    //console.log("hereeeeeeeeeeeeeeee jsao");
}

// Spin up the server
app.listen(app.get('port'), function () {
    console.log('running on port', app.get('port'))
})

async function resolveAfterXSeconds(x) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(x);
        }, x * 1000);
    });
}


async function greetUserText(userId) {
    let user = usersMap.get(userId);
    if (!user) {
        await resolveAfterXSeconds(2);
        user = usersMap.get(userId);
    }
    if (user) {
        sendTextMessage(userId, 'Good day, ' + user.first_name + '! ' +
            'Welcome to Talk About where you will get the summary reviews ' +
            'given by the past tourists of The Top Penang.');

        setTimeout(function() {
                sendTextMessage(userId,'I categoried the reviews into 5 groups such as guidance, comparative, directory, time and fee.');
            }, 1000);
        
        setTimeout(function() {
            sendTextMessage(userId,'At any time, use the menu below to navigate through the features.');
        }, 1500);

        setTimeout(function() {
            var responseGreet = "How can I help you today?"
                 var replies = [{
                     "content_type": "text",
                     "title": "Opinion",
                     "payload": "Opinion",
                 },
                 {
                     "content_type": "text",
                     "title": "Rating",
                     "payload": "Rating",
                 },
                 {
                     "content_type": "text",
                     "title": "Talk to live agent",
                     "payload": "Talk to live agent",
                 }];
                 sendQuickReply(userId, responseGreet, replies)
        }, 2300);

    } else {
        sendTextMessage(userId, 'Good day, ' + user.first_name + '! ' +
            'Welcome to Talk About where you will get the summary of review ' +
            'given by the past tourists of The Top Penang.');
        
        
        setTimeout(function() {
            sendTextMessage(userId,'At any time, use the menu below to navigate through the features.');
        }, 1500);

        setTimeout(function() {
            var responseGreet = "What I can do to help you today?"
                 var replies = [{
                     "content_type": "text",
                     "title": "Opinion",
                     "payload": "Opinion",
                 },
                 {
                     "content_type": "text",
                     "title": "Rating",
                     "payload": "Rating",
                 },
                 {
                     "content_type": "text",
                     "title": "Talk to live agent",
                     "payload": "Talk to live agent",
                 }];
                 sendQuickReply(userId, responseGreet, replies)
        }, 2000);
        
    }
}

//passing the control of the conversation to a page inbox
function sendPassThread(senderID){
    request(
        {
            uri: "https://graph.facebook.com/v2.6/me/pass_thread_control",
            qs: { access_token: config.FB_PAGE_TOKEN },
            method: "POST",
            json: {
                recipient: {
                    id: senderID
                },
                target_app_id: config.FB_PAGE_INBOX_ID // ID in the page inbox setting under messenger platform
            }
        }
    );

    setTimeout(function() {
        sendTextMessage(senderID,"I'll take a rest and let the live agent to engage with you xD")
    }, 1000)

    

    setTimeout(function() {
        let buttons = [
            {
                type:"postback", 
                payload:"TAKE_THREAD_CONTROL",
                title:"🤖Talk to bot again"
            }
        ];

        sendButtonMessage(senderID, "Click on the button below if you want me to talk to you again instead of the live agent :) ", buttons);
    }, 2000)

}

function takeThreadControl(senderID){
    request(
        {
            uri: "https://graph.facebook.com/v2.6/me/take_thread_control",
            qs: { access_token: config.FB_PAGE_TOKEN },
            method: "POST",
            json: {
                recipient: {
                    id: senderID
                }
            }
        }
    );
    sendTextMessage(senderID,"Hi, I'm back. :)");
    setTimeout(function() {
        var responseGreet = "Do you want to have a look on these information?"
             var replies = [{
                 "content_type": "text",
                 "title": "Opinion",
                 "payload": "Opinion",
             },
             {
                 "content_type": "text",
                 "title": "Rating",
                 "payload": "Rating",
             },
             {
                 "content_type": "text",
                 "title": "Talk to live agent",
                 "payload": "Talk to live agent",
             }];
             sendQuickReply(senderID, responseGreet, replies)
    }, 1000);

}

function sentimentTooLow(lastSentiment, differenceInScore){
    if (lastSentiment!==undefined && differenceInScore>4 && lastSentiment.score<0 && lastSentiment.score >-3){
        sendTextMessage(sender, 'Did I say something wrong ? ' + 
        'The live agent will be here ASAP to find out how we can serve you better.');
        sendPassThread(sender);
}

}
