'use strict';
const request = require('request'); //request module for calling fb graph API  
const config = require('./config'); //need to access data in the config
const pg = require('pg'); //access database
pg.defaults.ssl = true;

/*now using module.exports to create a module and export functions.
I've added a function called addUser and it is a function that will take the 
callback functioin and the userId (that is fb id).*/ 
module.exports = { 
    //this addUser function make a request to Fb graph and make database queries
    //what Im not sending here is the message, that is what the greet function will do
    addUser: function(callback, userId) {  //this function takes a callback and the userId
        request({
            uri: 'https://graph.facebook.com/v3.2/' + userId,
            qs: {
                access_token: config.FB_PAGE_TOKEN
            }

        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                var user = JSON.parse(body);
                if (user.first_name.length > 0) {
                    var pool = new pg.Pool(config.PG_CONFIG);
                    pool.connect(function(err, client, done) {
                        if (err) {
                            return console.error('Error acquiring client', err.stack);
                        }
                        var rows = [];
                        client.query(`SELECT fb_id FROM users WHERE fb_id='${userId}' LIMIT 1`,
                            function(err, result) {
                                if (err) {
                                    console.log('Query error: ' + err);
                                } else {
                                    if (result.rows.length === 0) {
                                        let sql = 'INSERT INTO users (fb_id, first_name, last_name, profile_pic) ' +
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

                        callback(user); //call the callback function and pass in the user object that was retrieved from fb
                    });                 //hence user will be sent back thru callback function and then we can store it into the map
                    pool.end();
                } else {
                    console.log("Cannot get data for fb user with id",
                        userId);
                }
            } else {
                console.error(response.error);
            }

        });
    },

}