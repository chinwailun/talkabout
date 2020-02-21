'use strict';
const request = require('request');
const config = require('./config');
const pg = require('pg');
pg.defaults.ssl = true;



module.exports = {

    //this function read all the opinions from database
    readAllOpinions: function(callback) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                    'SELECT text FROM public.top_opinion',
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback([]); //with an empty array if the query returns an error
                        } else {
                            let opinions = [];
                            for (let i = 0; i < result.rows.length; i++) {
                                opinions.push(result.rows[i]['text']);
                            }
                            callback(opinions); //when the query returns, it calls a callback we passed to the function, with the result
                        };
                    done();
                    });
        });
        pool.end();
    },

    readLink: function(callback) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                    'SELECT link FROM public.top_opinion',
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback([]); //with an empty array if the query returns an error
                        } else {
                            let link = [];
                            for (let i = 0; i < result.rows.length; i++) {
                                link.push(result.rows[i]['link']);
                            }
                            callback(link); //when the query returns, it calls a callback we passed to the function, with the result
                        };
                    done();
                    });
        });
        pool.end();
    }

}