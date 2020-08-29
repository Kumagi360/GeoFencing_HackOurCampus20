import * as firebase from 'firebase/app';
import 'firebase/database';

// Needed for async/await for some reason
import 'regenerator-runtime/runtime'

// If you try to run this code yourself, it won't work. 
// The API keys and associated information are contained in this private file,
// which is not published to GitHub to prevent abuse. 
import { firebaseConfig } from './firebase_private.js';

const ccoordsLT = [ 42.458938, -76.492466 ];
const ccoordsRB = [ 42.440911, -76.451231 ];

const dimX = ccoordsRB[1] - ccoordsLT[1];
const dimY = ccoordsRB[0] - ccoordsLT[0];

firebase.initializeApp(firebaseConfig);

const database = firebase.database();
const demoUsers = database.ref('DemoUsers');
const numSimulatedUsers = 9000;
var simulation = {};
var simulationMutex = false;
const walkingSpeedDelta = 0.000001; // ~ 2 m/s
function randomRange(min, max) { return (max - min) * Math.random() + min; }

const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');
const densityImage = document.getElementById('density-image'); 
densityImage.onload = function(){
	canvas.width = densityImage.width;
	canvas.height = densityImage.height;
	context.drawImage(densityImage, 0, 0);
}

function get_simulation() {
	demoUsers.once('value').then(function(dataSnapshot){
		simulation = dataSnapshot.val();
	});
}
function clear_simulation() {
	simulation = {};
	demoUsers.remove();
}
function getProb(lat, lon){
	// perform a lookup on the density map image, the greyscale val of the pixel 
	// is the probability of spawning
	const xNorm = ( lon-ccoordsLT[1] ) / dimX;
	const yNorm = ( lat-ccoordsLT[0] ) / dimY;
	let imgData = context.getImageData(xNorm * canvas.width, yNorm * canvas.height, 1, 1);
	return imgData.data[0] / 255;
}
function seed_simulation() {
	// TODO: Weighted spawn seeds
	console.log("Seeding simulation");
	simulationMutex = true;
	for(let i = 0; i < numSimulatedUsers; i++){
		let rlat = null;
		let rlon = null;
		while(true){
			rlat = randomRange(ccoordsLT[0], ccoordsRB[0]);
			rlon = randomRange(ccoordsLT[1], ccoordsRB[1]);
			if(Math.random() < getProb(rlat, rlon)) break;
		}
		simulation[i] = {
			Latitude: rlat,
			Longitude: rlon,
			Velocity: [ randomRange(-1 * walkingSpeedDelta, walkingSpeedDelta), randomRange(-1 * walkingSpeedDelta, walkingSpeedDelta) ]
		}
	}
	console.log("Simulation seeded");
	demoUsers.set(simulation);
	simulationMutex = false;
}
function update_simulation() {
	// choose a random user
	if(simulationMutex == true || simulation == null || Object.keys(simulation).length == 0) return;
	const userIndex = Math.floor(Math.random() * Object.keys(simulation).length).toString();
	let user = simulation[userIndex];
	simulation[userIndex].Latitude += user.Velocity[0];
	simulation[userIndex].Longitude += user.Velocity[1];
	// choose a new velocity
	// get old angle
	const oldAngle = Math.atan2(user.Velocity[1], user.Velocity[0]);
	// create delta
	let delta = Math.sqrt(Math.random());
	// merge delta with angle
	let newAngle = oldAngle + ( -1 * Math.round(Math.random()) ) * delta;
	// now make a new magnitude
	let newMagnitude = randomRange(0, walkingSpeedDelta);
	simulation[userIndex].Velocity = [ Math.cos(newAngle) * newMagnitude, Math.sin(newAngle) * newMagnitude ];
	demoUsers.child(userIndex).set(simulation[userIndex]);
}
window.onload = async function(){
	console.log("Populator Online");
	get_simulation();
	document.getElementById("restart_simulation").onclick = () => {
		clear_simulation();
		seed_simulation();
	}
	// setInterval(update_simulation, 1000); // every 64 ms, update one position
}

