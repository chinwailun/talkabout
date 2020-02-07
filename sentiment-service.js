const Sentiment = require('sentiment');
const sentiment = new Sentiment();

//store all user sentiments into a map so each user will have its data of sentiment analysis
const userSentiment = new Map();

module.exports = {
    //adding calculating the sentiment and adding it to userSentiment map
    addUserSentiment(senderId, messageText){

        //read sentiment analysis
        let result = sentiment.analyze(messageText);
        //console.log('sentiment analysis:');
        //console.log(result); 

        //create an object to which i store the following data
        let sentimentResult = {
            score: result.score,
            comparative: result.comparative,
            text:messageText
        }

 
        let snt = {};

        //not delete the older version in the userSentiment map. If there are any, need to read the previous ones
        //read previous sentiment and add the current to them   
        if(userSentiment.has(senderId)){
            snt=userSentiment.get(senderId);
        }

        //store sentiment for all takes interactions
        //here will add the sentiment and store them by the time they happen
        //so the key will be the timestamp of the time when sentiment was done
        snt[Math.floor(Date.now()/1000)] = sentimentResult;

        //add to userSentiment map whatever we got from the analysis and store it under the userId property
        userSentiment.set(senderId,sentimentResult);
    },

    //reading out the user sentiment map
    getUserSentiment(senderId){
        if(userSentiment.has(senderId)){
            return userSentiment.get(senderId);
        } else {
            //return an empty object
            return{};
        }
        
    }

    
}