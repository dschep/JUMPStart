'use strict';

const fetch = require('node-fetch');
const middy = require('middy');
const {ssm} = require('middy/middlewares');
const turf = require('@turf/turf');
const AWS = require('aws-sdk');


const home = {
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [-77.01058, 38.91105],
  },
};

const jumpstart = (event, context) => fetch('https://dc.jumpmobility.com/opendata/free_bike_status.json')
  .then(resp => resp.json())
  .then(({data: {bikes}}) => ({
    type: 'FeatureCollection',
    features: bikes.map(({lat, lon}) => ({
      type: 'Point',
      coordinates: [lon, lat],
    }))
  }))
  .then(geojson => {
    for (const feature of geojson.features) {
      feature.properties = {
        distance: turf.distance(home, feature),
      };
    }
    geojson.features = geojson.features.sort(
      (a, b) => a.properties.distance < b.properties.distance ? -1 : 1);
    return geojson.features[0];
  })
  .then(nearestBike => {
    const params = {
      token: context.pushoverApiToken,
      user: context.pushoverUserKey,
      message: `The nearest JUMP bike is ${nearestBike.properties.distance.toFixed(2)}mi away.`,
      url: `https://www.google.com/maps?q=${nearestBike.coordinates[1]},+${nearestBike.coordinates[0]}`,
      url_title: 'View in Google Maps',
    };
    const encodedParams = Object.keys(params).map(
      k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
    return fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      body: encodedParams,
    });
  })

const handler = middy(jumpstart);
handler.use(ssm({
  params: {
    pushoverApiToken: `/${process.env.SERVICE_NAME}/${process.env.STAGE}/pushover_api_token`,
    pushoverUserKey: `/${process.env.SERVICE_NAME}/${process.env.STAGE}/pushover_user_key`,
  },
  setToContext: true,
}));
module.exports.jumpstart = handler
