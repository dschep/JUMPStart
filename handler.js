'use strict';

const fetch = require('node-fetch');
const middy = require('middy');
const {ssm, cors} = require('middy/middlewares');
const turf = require('@turf/turf');
const AWS = require('aws-sdk');
const webpush = require('web-push');
const docClient = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();


const home = {
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [-77.01058, 38.91105],
  },
};

const jumpstart = middy((event, context) => {
  webpush.setVapidDetails(
    'mailto:dschep@gmail.com',
    context.vapidPublicKey,
    context.vapidPrivateKey);
  const bikesGeoJsonPromise = fetch('https://dc.jumpmobility.com/opendata/free_bike_status.json')
    .then(resp => resp.json())
    .then(({data: {bikes}}) => ({
      type: 'FeatureCollection',
      features: bikes.map(({lat, lon}) => ({
        type: 'Point',
        coordinates: [lon, lat],
      }))
    }));
  const subscriptionPromise = docClient.scan({TableName: process.env.TABLE}).promise();
  return Promise.all([bikesGeoJsonPromise, subscriptionPromise])
    .then(([geojson, {Items}]) => Promise.all(Items.map((subscriptionAndLocation) => {
      const location = subscriptionAndLocation.location;
      delete subscriptionAndLocation.location;
      for (const feature of geojson.features) {
        feature.properties = {
          distance: turf.distance({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [location.lng, location.lat],
            },
          }, feature),
        };
      }
      geojson.features = geojson.features.sort(
        (a, b) => a.properties.distance < b.properties.distance ? -1 : 1);
      const nearestBike = geojson.features[0];
      if (nearestBike.properties.distance > 0.5)
        return;
      const message = `The nearest JUMP bike is ${nearestBike.properties.distance.toFixed(2)}mi away.`;
      const url = `https://www.google.com/maps?q=${nearestBike.coordinates[1]},+${nearestBike.coordinates[0]}`;

        return webpush.sendNotification(subscriptionAndLocation, JSON.stringify({
          message,
          url,
        }))
        .catch((err) => docClient.delete({
          TableName: process.env.TABLE,
          Key: {endpoint: subscriptionAndLocation.endpoint},
        }).promise());
    })))
    .then(console.log);
});
jumpstart.use(ssm({
  params: {
    vapidPrivateKey: `/${process.env.SERVICE_NAME}/${process.env.STAGE}/vapid_private_key`,
    vapidPublicKey: `/${process.env.SERVICE_NAME}/${process.env.STAGE}/vapid_public_key`,
  },
  setToContext: true,
}));

const register = middy((event) => docClient.put({
  TableName: process.env.TABLE,
  Item: JSON.parse(event.body),
}).promise()
  .then((res) => ({statusCode: 200, body: JSON.stringify(res)}))
  .catch((err) => ({statusCode: 500, body: JSON.stringify(err)})));
register.use(cors());

const unregister = middy((event) => docClient.delete({
  TableName: process.env.TABLE,
  Key: JSON.parse(event.body),
}).promise()
  .then((res) => ({statusCode: 200, body: JSON.stringify(res)}))
  .catch((err) => ({statusCode: 500, body: JSON.stringify(err)})));
unregister.use(cors());

const sunset = middy((event, context) => {
  webpush.setVapidDetails(
    'mailto:dschep@gmail.com',
    context.vapidPublicKey,
    context.vapidPrivateKey);
  return docClient.scan({TableName: process.env.TABLE}).promise()
    .then(({Items}) => Promise.all(Items.map((subscriptionAndLocation) => {
      delete subscriptionAndLocation.location;
      const message = "I've discontinued JUMPStart in light of news of JUMP's acquisition by Uber";
      const url = 'https://github.com/dschep/jumpstart';

      return webpush.sendNotification(subscriptionAndLocation, JSON.stringify({
        message,
        url,
      }))
      .catch((err) => docClient.delete({
        TableName: process.env.TABLE,
        Key: {endpoint: subscriptionAndLocation.endpoint},
      }).promise());
    })))
    .then(console.log);
});
sunset.use(ssm({
  params: {
    vapidPrivateKey: `/${process.env.SERVICE_NAME}/${process.env.STAGE}/vapid_private_key`,
    vapidPublicKey: `/${process.env.SERVICE_NAME}/${process.env.STAGE}/vapid_public_key`,
  },
  setToContext: true,
}));

module.exports = {
  jumpstart,
  register,
  unregister,
  sunset,
};
