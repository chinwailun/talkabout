'use strict';

/*loading up the modules that will need  */
const dialogflow = require('dialogflow');
const config = require('./config'); //load the config file
const express = require('express');
const crypto = require('crypto'); //crypto will need for verifying request signature
const bodyParser = require('body-parser'); //body parser is for parsing request data. Request for making request
const request = require('request');
const app = express(); //here create the app with express //exprese is a node.js application framework that provides a robust set of features for applications. In other words, it speed up application development.
const uuid = require('uuid');

const pg = require('pg');
pg.defaults.ssl = true;

const colors = require('./colors');

let a = {};
 
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

//set the port to 5000
app.set('port', (process.env.PORT || 5000))

//verify request came from facebook
app.use(bodyParser.json({
    verify: verifyRequestSignature //verifyRequestSignature is a function that verify request came from facebook, from the right application
}));

//serve static files in the public directory
app.use(express.static('public')); //means set the folder public where we store images, videos or anything we want to share with the user. Basically this line makes the folder visible, so it is accessible via the http

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
 *
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

            // Iterate over each messaging event
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
        });

        // Assume all went well.
        // You must send back a 200, within 20 seconds
        res.sendStatus(200);
    }
});

//set global user data that can be accessed from anywhere in the code
function setSessionAndUser(senderID) {
    if (!sessionIds.has(senderID)) {
        sessionIds.set(senderID, uuid.v1());
        a[senderID]=0;
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
    } else if (messageAttachments) { //if it is attachment(file, image, sticker, video), then call the handleMessageAttachments
        handleMessageAttachments(messageAttachments, senderID);
    }
}


function handleMessageAttachments(messageAttachments, senderID){
    //send back to user's response 'attachment received'
    sendTextMessage(senderID, "Attachment received. Thank you.");
}

//send the quick reply to Dialogflow to handle it for us
function handleQuickReply(senderID, quickReply, messageId) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
    //send payload to api.ai
    sendToDialogFlow(senderID, quickReplyPayload);
}

//https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
    // Just logging message echoes to console
    console.log("Received echo for message %s and app %d with metadata %s", messageId, appId, metadata);
}

function handleDialogFlowAction(sender, action, messages, contexts, parameters) {
    switch (action) {

        case "buy.iphone":
            //we call readUserColor. We pass in callback function and the sender. In the callback function we get color from readUserColor
            colors.readUserColor(function(color) {
                    let reply;
                    if (color === '') { //if the returned color is empty, means user did not tell us his/her favourite color
                        reply = 'In what color would you like to have it?';
                    } else {
                        reply = `Would you like to order it in your favourite color ${color}?`;
                    }
                    sendTextMessage(sender, reply);

                }, sender
            )
            break;

        case "iphone_colors.favourite": //here catch the fallback's intent action
            colors.updateUserColor(parameters.fields['color'].stringValue, sender); //color will be in parameters.fields['color'].stringValue. After read the paramter then call the updateUserColor function
            let reply = `Oh, I like it, too. I'll remember that.`; 
            sendTextMessage(sender, reply);
            break;

        case "iphone_colors":
            colors.readAllColors(function (allColors) { //call the function readAllColors, pass in the callback (this is a function that will be called when the colors are returned). Here callback with the paramter allColors, this is an array, array of colors read from database
                //let allColorsString = allColors.join(', '); //change it to string with a join method, now we have colored separated with a comma in a string
                let haha = a[senderID].stringValue;
                let reply = `IPhone xxx is available in ${allColors[haha]}. What is your favourite color?`;
                console.log("haha is this" + haha);
                //a[senderID] = a[senderID] +1;
                sendTextMessage(sender, reply); 
            });
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
              
            sendEmail('New job application', emailContent);*/

            /***************database stuff starts here***********************/

            /*var pool = new pg.Pool(config.PG_CONFIG);
            pool.connect(function(err, client, done){
                if(err){
                    return console.error('Error acquiring client',err.stack);
                }
                client
                    .query(
                        'INSERT into job ' +
                        '(user_name, previous_job, years_of_experience, ) ' +
                        'VALUES($1,$2,$3) RETURNING id',
                        [user_name, previous_job, years_of_experience],
                        function(err, result){
                            if(err){
                                console.log(err);
                            } else{
                                console.log('row inserted with id: ' + result.rows[0].id);
                            }
                        });
                    
            });
            pool.end();*/


            /***************database stuff starts here***********************/
/*
            handleMessages(messages, sender); //after sent email will also send response message back to messenger

            } else {
                    handleMessages(messages, sender); //we need to send response back to messenger with a question for the next paramter
            }
                
            break;*/
        default:
            //unhandled action, just send back the text
            handleMessages(messages, sender);
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

    let elements = [];
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
    }
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

    if (isDefined(action)) { //if action is defined, then see what it is and handle it
        handleDialogFlowAction(sender, action, messages, contexts, parameters); //if dialogflow returns an intent, that has an action set, then call the handleDialogFlowAction
    } else if (isDefined(messages)) { //if there is no action, we need to handle messages we received from Dialogflow
        handleMessages(messages, sender);//the responses we set in dialogflow will be handle in handleMessages method
    } else if (responseText == '' && !isDefined(action)) {
        //dialogflow could not evaluate input. If there was error and we didnt get any data, than we still provide an answer to the user
        sendTextMessage(sender, "I'm not sure what you want. Can you be more specific?"); //this will only happen if you dont hv the default fallback intent
    } else if (isDefined(responseText)) {
        sendTextMessage(sender, responseText);
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

        case 'GET_STARTED':
            greetUserText(senderID);
            break;

        case 'JOB_APPLY':
            //get feedback with new jobs
			sendToDialogFlow(senderID, 'job openings');
            break;

        case 'CHAT':
            //user wants to chat
            sendTextMessage(senderID, "I love chatting too. Do you have any other questions for me?");
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

// Spin up the server
app.listen(app.get('port'), function () {
    console.log('running on port', app.get('port'))
})

function greetUserText(userId) {
	//first read user firstname
	request({ //make a request to facebook graph API and pass access token
		uri: 'https://graph.facebook.com/v3.2/' + userId, 
		qs: {
			access_token: config.FB_PAGE_TOKEN 
		}

	}, function (error, response, body) {
		if (!error && response.statusCode == 200) {

			var user = JSON.parse(body);
			console.log('getUserData: ' + user); //when get the response, read the user object and send a message to the user
			if (user.first_name) { 

                /*****************************************************/
                /*insert user into database table==========start here*/ 
				//console.log("FB user: %s %s, %s", user.first_name, user.last_name, user.profile_pic);

                var pool = new pg.Pool(config.PG_CONFIG); //create a connection pool (connection pool is a group of database connections setting around, waiting to be handed out and used) , this means when a request comes, a connection is already there and given to the application for that specific request.  
                pool.connect(function(err, client, done) { //without any connection pooling, the application will have to reach out to the database to establish a connection
                    if (err) {
                        return console.error('Error acquiring client', err.stack);
                    }
                    var rows = [];
                    client.query(`SELECT fb_id FROM users WHERE fb_id='${userId}' LIMIT 1`, //search for a user with the facebook id, we've gotten from the facebook graph
                        function(err, result) {
                            if (err) {
                                console.log('Query error: ' + err);
                            } else {

                                if (result.rows.length === 0) {
                                    let sql = 'INSERT INTO users (fb_id, first_name, last_name, profile_pic) ' + //if there is no entry in a database, then make it by executing the insert statament
										'VALUES ($1, $2, $3, $4)'; 
                                    client.query(sql,
                                        [
                                            userId,
                                            user.first_name,
                                            user.last_name,
                                            user.profile_pic
                                        ]);
                                }
                            }
                        });

                });
                pool.end();
                /*insert user into database table ========= end here */
                /*****************************************************/
				sendTextMessage(userId, "Welcome " + user.first_name + '! ' +
                    'I can answer questions related to certain point of interests ' +
                    'and be your travel assistant. What can I help you with?');
			} else {
				console.log("Cannot get data for fb user with id",
					userId);
			}
		} else {
			console.error(response.error);
		}

	});
}