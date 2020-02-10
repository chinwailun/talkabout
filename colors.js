'use strict';
const request = require('request');
const config = require('./config');
const pg = require('pg');
pg.defaults.ssl = true;



module.exports = {
    //this function read all the colors from database
    readAllColors: function(callback) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                    'SELECT color FROM public.iphone_colors',
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback([]); //with an empty array if the query returns an error
                        } else {
                            let colors = [];
                            for (let i = 0; i < result.rows.length; i++) {
                                colors.push(result.rows[i]['color']);
                            }
                            callback(colors); //when the query returns, it calls a callback we passed to the function, with the result
                        };
                    });
        });
        pool.end();
    },

    //this function will call the callback with the favourite color or with an empty string
    readUserColor: function(callback, userId) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                    'SELECT color FROM public.users WHERE fb_id=$1',   //get the favourite color from the user
                    [userId],
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback(''); //if it doesn't exist, it call the callback with an empty string
                        } else {
                            callback(result.rows[0]['color']);
                        };
                    });

        });
        pool.end();
    },

    //perform a simple update on the user's table. It update the color field with the new favourite color
    updateUserColor: function(color, userId) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            let sql = 'UPDATE public.users SET color=$1 WHERE fb_id=$2';
            client.query(sql,
                [
                    color,
                    userId
                ]);

        });
        pool.end();
    }


}