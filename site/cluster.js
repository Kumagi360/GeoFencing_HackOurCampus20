import * as firebase from 'firebase/app';
import 'firebase/database';

// Needed for async/await for some reason
import 'regenerator-runtime/runtime'

// If you try to run this code yourself, it won't work. 
// The API keys and associated information are contained in this private file,
// which is not published to GitHub to prevent abuse. 
import { firebaseConfig } from './firebase_private.js';

const latTop = 42.458938;
const latBottom = 42.440911;
const lonLeft = -76.492466;
const lonRight = -76.451231;

const tilesPerDim = 128;
const numTiles = 128 * 128;
const latStep = ( latTop - latBottom ) / tilesPerDim;
const lonStep = ( lonRight - lonLeft ) / tilesPerDim; // This step is negative. I know.
const tiles = new Array(numTiles); // 128 by 128 array

const minimumClusterPopulation = 4;
const maximumClusterDistance = 0.00005;

function getTileIndex(lat, lon){
	let latIndex = Math.floor(( lat - latBottom ) / latStep);
	let lonIndex = Math.floor(( lon - lonLeft ) / lonStep);
	return (latIndex * tilesPerDim) + lonIndex;
}
firebase.initializeApp(firebaseConfig);


const database = firebase.database();
const source = database.ref('DemoUsers');
var destination = database.ref('DemoHotspots');
var clusters = {};

function addSource(val){
	let lat = val.Latitude;
	let lon = val.Longitude;
	let tileIndex = getTileIndex(lat, lon);
	if(tileIndex < 0 || tileIndex > numTiles - 1){
		console.log(`Invalid tile index, discarding! (Is this point outside of Cornell and it's immediate vicinity?)\nLat/Long: [ ${lat}, ${lon} ]`);
	}
	// Stick it in the bucket
	val.fullyChecked = false; // ... but add this variable first to accelerate cluster building
	val.clusterID = "";
	if(tiles[tileIndex] == undefined) tiles[tileIndex] = [val];
	else tiles[tileIndex].push(val);
}

function getValidSearchTiles(tileIndex){
	let arr = [tileIndex];
	let mod = tileIndex;
	let backOne = tileIndex - 1;
	let forwardOne = tileIndex + 1;
	if(backOne % tilesPerDim < mod){
		if(backOne - tilesPerDim > 0) arr.push(backOne - tilesPerDim);
		if(backOne > 0) arr.push(backOne);
		if(backOne + tilesPerDim < numTiles - 1) arr.push(backOne + tilesPerDim);
	}
	if(forwardOne % tilesPerDim > mod) {
		if(forwardOne - tilesPerDim > 0) arr.push(forwardOne - tilesPerDim);
		if(forwardOne < numTiles - 1) arr.push(forwardOne);
		if(forwardOne + tilesPerDim < numTiles - 1) arr.push(forwardOne + tilesPerDim);
	}
	if(tileIndex - tilesPerDim > 0 ) arr.push(tileIndex - tilesPerDim);
	if(tileIndex + tilesPerDim < numTiles - 1) arr.push(tileIndex + tilesPerDim);
	return arr;
}

// From https://gist.github.com/jed/982883
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

function distance(person1, person2){
	let deltaLat = person2.Latitude - person1.Latitude;
	let deltaLon = person2.Longitude - person1.Longitude;
	return Math.sqrt( deltaLat*deltaLat + deltaLon*deltaLon );
}
function addToCluster(cluster, addition){
	let newPop = cluster.Population + 1;
	let oldFac = cluster.Population / newPop;
	let newFac = 1 / newPop;
	cluster.Latitude = cluster.Latitude * oldFac + addition.Latitude * newFac;
	cluster.Longitude = cluster.Longitude * oldFac + addition.Longitude * newFac;
	if(cluster.ExtremaLTRB == null){
		cluster.ExtremaLTRB = [cluster.Longitude, cluster.Latitude, cluster.Longitude, cluster.Latitude];
	}
	else{
		if(addition.Latitude < cluster.ExtremaLTRB[1]) cluster.ExtremaLTRB[1] = addition.Latitude;
		else if(addition.Latitude > cluster.ExtremaLTRB[3]) cluster.ExtremaLTRB[3] = addition.Latitude;
		if(addition.Longitude < cluster.ExtremaLTRB[0]) cluster.ExtremaLTRB[0] = addition.Longitude;
		else if(addition.Longitude > cluster.ExtremaLTRB[2]) cluster.ExtremaLTRB[2] = addition.Longitude;
	}
	cluster.Population++;
	return cluster;
}
function getClusterRadius(cluster){
	let avgDeltaLon = ( cluster.ExtremaLTRB[2] - cluster.ExtremaLTRB[0] ) / 2;
	let avgDeltaLat = ( cluster.ExtremaLTRB[3] - cluster.ExtremaLTRB[1] ) / 2;
	let avgDelta = (avgDeltaLon + avgDeltaLat) * 0.5;
	return  avgDelta * 1.333; // Artificially extend radius to create a "safe zone"
}

function identifyClusters(){
	// Clear existing clusters
	destination.remove();
	clusters = {};
	console.log("Beginning cluster identification...");
	for(let ti = 0; ti < numTiles; ti++){
		let searchTiles = getValidSearchTiles(ti);
		// Build up people list
		let people = [];
		for(let si = 0; si < searchTiles.length; si++){
			people = people.concat(tiles[searchTiles[si]]); // cool cool cool
		}
		for(let pi = 0; pi < people.length; pi++){
			let tempCluster = {
				Latitude: 0,
				Longitude: 0,
				Population: 0,
				ExtremaLTRB: null,
			};
			if(people[pi] == undefined) continue;
			let CID = people[pi].clusterID;
			if(CID != ""){
				tempCluster = clusters[CID];
			}
			else {
				CID = uuidv4();
				people[pi].clusterID = CID;
				addToCluster(tempCluster, people[pi]);
			}
			
			for(let pi2 = pi; pi2 < people.length; pi2++){
				if(people[pi2] == undefined) continue;
				if(people[pi2].fullyChecked) continue; // We've already fully checked this one
				let CID2 = people[pi2].clusterID;
				if(CID == CID2) continue; // already in the same cluster
				if(CID2 != "") continue; // cluster intersection -- very rare! fix later, or don't fix at all
				let dist = distance(people[pi], people[pi2]);
				// console.log(dist);
				if( dist < maximumClusterDistance ){
					tempCluster = addToCluster(tempCluster, people[pi2]);
					people[pi2].clusterID = CID;
				}
			}
			// if there are two candidates, throw the temp cluster in the cluster list
			if(tempCluster.Population > 1){
				clusters[CID] = tempCluster;
			}
			else{
				people[pi].clusterID = "";
			}
			people[pi].fullyChecked = true;
		}
		
	}
	// now go through allll the clusters and write any valid ones to the DB
	destination = database.ref().child("DemoHotspots");
	for(const key in clusters){
		let tempCluster = clusters[key];
		tempCluster.Radius = getClusterRadius(tempCluster);
		if(tempCluster.Population >= minimumClusterPopulation){
			console.log(`	Cluster identified! Lat/Long: ${tempCluster.Latitude}, ${tempCluster.Longitude}, radius ${tempCluster.Radius}, population ${tempCluster.Population}`);
			
			destination.child( key ).set(tempCluster);
		}
	};
	/*
	// write to DB
				
	*/
	console.log("Cluster identification complete.");
	// Upload cluster data
}
const identify_cluster_button = document.getElementById("identify_cluster_button");

window.onload = function(){
	source.once('value').then(function(snapshot) {
		console.log("Recieved snapshot from Firebase. " + snapshot.numChildren() + " child nodes. Initiating bucketing process.");
		snapshot.forEach(function(childSnapshot){
			addSource(childSnapshot.val());
		});
		console.log("Finished bucketing, ready for clustering.");
		console.log(tiles);
		identify_cluster_button.addEventListener('click', identifyClusters);
	});
};