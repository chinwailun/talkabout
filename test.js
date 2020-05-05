const Grammarbot = require('grammarbot');
 
const bot = new Grammarbot({
  'api_key' : 'node_default',      
  'language': 'en-US',         
  'base_uri': 'api.grammarbot.io', 
});
 

bot.check("You can knew more of the history and many information about Penang", function(error, result) {
  console.log("Original sentence: You can knew more of the history and many information about Penang.");
  console.log("Suggested sentence: You can know more of the history and much information about Penang.");
  if (!error) {console.log(JSON.stringify(result.matches[0].message));
    console.log(JSON.stringify(result.matches[1].message));
    //console.log(JSON.stringify(result.matches[2].message));
  }
  //console.log(JSON.stringify(result));
  //if (!error) console.log(JSON.stringify(result.matches[0].message));
});