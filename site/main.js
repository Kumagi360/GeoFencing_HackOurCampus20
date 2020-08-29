import 'ol/ol.css';
import {Map, View} from 'ol';
import * as olProj from 'ol/proj';
import * as olExtent from 'ol/extent';
import {Heatmap as HeatmapLayer, Tile as TileLayer} from 'ol/layer';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import WebGLPointsLayer from 'ol/layer/WebGLPoints';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';

import * as firebase from 'firebase/app';
import 'firebase/database';

// If you try to run this code yourself, it won't work. 
// The API keys and associated information are contained in this private file,
// which is not published to GitHub to prevent abuse. 
import { firebaseConfig } from './firebase_private.js';

// Needed for async/await for some reason
import 'regenerator-runtime/runtime'

firebase.initializeApp(firebaseConfig);

const database = firebase.database();
var watchedUsers = database.ref('Users');
var clusters = database.ref('Hotspots');

function averageCoords(a, b) {
	return [ (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 ];
}
// Hardcoded constants
const cornellTL = olProj.fromLonLat([-76.492466, 42.458938]);
const cornellBR = olProj.fromLonLat([-76.451231, 42.440911]);
const mapCenter = averageCoords(cornellTL, cornellBR);
const mapExtents = olExtent.boundingExtent([cornellTL, cornellBR]);

const watchSource = new VectorSource();

const clusterSource = new VectorSource();

const mapView = new View({
	center: mapCenter,
	extent: mapExtents,
	constrainOnlyCenter: true,
	zoom: 14,
	minZoom: 14.5
});

const raster = new TileLayer({
	source: new OSM({
		// cacheSize: 5
		// TODO: How does cacheSize operate? Is there a way to cache more tiles so it's not constantly reloading?
	}),
	zIndex: 0
});

function makeBlur(val){
	return 18 / Math.min(val, 3);
}
function makeRadius(val){
	return 10 / Math.min(val, 3.8);
}

const heatmapLayer = new HeatmapLayer({
	source: watchSource,
	blur: makeBlur(mapView.getResolution()),
	radius: makeRadius(mapView.getResolution()),
	weight: function() { return 1; },
	zIndex: 2
});


const pointsLayerStyle = {
	symbol: {
		symbolType: 'circle',
		size: ['clamp', ['/', 5, ['resolution']], ['/', ['zoom'], 3], 100000],
		color: '#240572',
		offset: [0, 0],
		opacity: 0.5,
	},
};
const pointsLayer = new WebGLPointsLayer({
	source: watchSource,
	style: pointsLayerStyle,
	disableHitDetection: true,
	zIndex: 3
});

const clusterLayerStyle = {
	symbol: {
		symbolType: 'image',
		
		/* 
		 * The reason that this is not 'assets/cluster.png'
		 *  is because parcel generates renamed versions of all assets 
		 *  during deployment, at least locally. So cluster.png becomes,
		 *  for example, cluster.50df4889.png. There is probably a way
		 *  to disable this in parcel, but for now I use this workaround.
		 */
		 
		src: document.getElementById('parcel-workaround').href,
		
		size: [ '/', ['*', ['get', 'radius'], 1000000], ['resolution'] ], // constant size
		color: '#FF7777',
		offset: [0, 0],
		rotateWithView: false,
		opacity: 0.9,
	},
};

const clusterLayer = new WebGLPointsLayer({
	source: clusterSource,
	style: clusterLayerStyle,
	disableHitDetection: true,
	zIndex: 4
});

const map_element = document.getElementById('watcher_map');
const map = new Map({
  target: 'watcher_map',
  layers: [
	raster
  ],
  
  view: mapView
});

mapView.on('change:resolution', (res) => {
	heatmapLayer.setBlur(makeBlur(res.oldValue));
	heatmapLayer.setRadius(makeRadius(res.oldValue));
});

const toggle_points = document.getElementById("toggle_points");
function update_points_settings(){
	if(toggle_points.checked) map.addLayer(pointsLayer);
	else map.removeLayer(pointsLayer);
}
toggle_points.addEventListener('change', update_points_settings);


const toggle_heatmap = document.getElementById("toggle_heatmap");
function update_heatmap_settings(){
	if(toggle_heatmap.checked) map.addLayer(heatmapLayer);
	else map.removeLayer(heatmapLayer);
}
toggle_heatmap.addEventListener('change', update_heatmap_settings);

const toggle_clusters = document.getElementById("toggle_clusters");
function update_cluster_settings(){
	if(toggle_clusters.checked) map.addLayer(clusterLayer);
	else map.removeLayer(clusterLayer);
}
toggle_clusters.addEventListener('change', update_cluster_settings);

const source_selector = document.getElementById("source_selector");
function update_source(){
	watchedUsers = database.ref(source_selector.value + "Users");
	clusters = database.ref(source_selector.value + "Hotspots");
	all_refresh();
}
source_selector.addEventListener('change', update_source);

const toggle_sidebar = document.getElementById("toggle_sidebar");
const toggle_sidebar_indicator = document.getElementById("toggle_sidebar_indicator");
const content_sidebar = document.getElementById("content_sidebar");

function update_sidebar_settings(){
	if(toggle_sidebar.getAttribute("state") == "extended"){
		toggle_sidebar.classList.add("toggle-sidebar-collapsed");
		toggle_sidebar.classList.remove("toggle-sidebar-extended");
		toggle_sidebar_indicator.classList.add("toggle-sidebar-indicator-collapsed");
		toggle_sidebar_indicator.classList.remove("toggle-sidebar-indicator-extended");
		content_sidebar.classList.add("content-sidebar-collapsed");
		content_sidebar.classList.remove("content-sidebar-extended");
		toggle_sidebar.setAttribute("state", "collapsed");
	}
	else {
		toggle_sidebar.classList.add("toggle-sidebar-extended");
		toggle_sidebar.classList.remove("toggle-sidebar-collapsed");
		toggle_sidebar_indicator.classList.add("toggle-sidebar-indicator-extended");
		toggle_sidebar_indicator.classList.remove("toggle-sidebar-indicator-collapsed");
		content_sidebar.classList.add("content-sidebar-extended");
		content_sidebar.classList.remove("content-sidebar-collapsed");
		toggle_sidebar.setAttribute("state", "extended");
	}
	map.updateSize();
}
toggle_sidebar.addEventListener("click", update_sidebar_settings);


const api_error_indicator_label = document.getElementById("api_error_indicator_label");
const api_error_wrapper = document.getElementById("api_error_wrapper");

function throwAPIError(error){
	// textContent is used rather than innerHTML to prevent potential wackiness
	api_error_indicator_label.textContent = "(" + error + ")";
	api_error_wrapper.classList.add("api-error-wrapper-appear");
}
function clearAPIError(){
	const cl = api_error_wrapper.classList;
	if(cl.contains("api-error-wrapper-appear")){
		api_error_wrapper.classList.remove("api-error-wrapper-appear");
		api_error_wrapper.classList.add("api-error-wrapper-disappear");
	}
}

const num_watched_element = document.getElementById("num_watched");
var _num_watched = 0;

const num_clusters_element = document.getElementById("num_clusters");
var _num_clusters = 0;

const extensions = [ '', 'k', 'm', 'b' ];
function generate_compact_text(num){
	let i = 0;
	const fac = 0.001; // mult faster than division
	while( num * fac > 1 ){ i++; num *= fac; }
	return Math.round(num).toString() + extensions[i];
}
function create_watch_feature(data){
	let v = data.val();
	let coords = olProj.fromLonLat([v.Longitude, v.Latitude]);
	let f = new Feature({
		geometry: new Point(coords)
	});
	f.setId(data.key);
	return f;
}

function create_cluster_feature(data){
	let v = data.val();
	let coords = olProj.fromLonLat([v.Longitude, v.Latitude]);
	let f = new Feature({
		geometry: new Point(coords),
		radius: v.Radius,
		population: v.Population
	});
	f.setId(data.key);
	return f;
}
function watcher_add(data){
	watchSource.addFeature(create_watch_feature(data));
	_num_watched++;
	num_watched_element.innerText = generate_compact_text(_num_watched);
}
function watcher_update(data){
	console.log("[Firebase] Data update");
	// KLUDGE: Not sure what the "proper" way to update a feature is,
	//  so I will just remove & readd it
	let f = watchSource.getFeatureById(data.key);
	if(f==null){
		throwAPIError("Unbound watch data update");
		return;
	}
	watchSource.removeFeature(f);
	watchSource.addFeature(create_watch_feature(data));
}
function watcher_remove(data){
	// Todo: Benchmark this, is this more expensive or less expensive
	//  than constructing a new feature and passing that into
	//  removeFeature?
	watchSource.removeFeature(watchSource.getFeatureById(data.key));
	_num_watched--;
	num_watched_element.innerText = generate_compact_text(_num_watched);
}

function cluster_add(data){
	clusterSource.addFeature(create_cluster_feature(data));
	_num_clusters++;
	num_clusters_element.innerText = generate_compact_text(_num_clusters);
}
function cluster_update(data){
	// KLUDGE: Not sure what the "proper" way to update a feature is,
	//  so I will just remove & readd it
	let f = clusterSource.getFeatureById(data.key);
	if(f==null){
		throwAPIError("Unbound cluster data update");
		return;
	}
	clusterSource.removeFeature(f);
	clusterSource.addFeature(create_cluster_feature(data));
}
function cluster_remove(data){
	clusterSource.removeFeature(clusterSource.getFeatureById(data.key));
	_num_clusters--;
	num_clusters_element.innerText = generate_compact_text(_num_clusters);
}
async function all_refresh(){
	try {
		console.log("[Firebase] Attempting full refresh");
		const watchSnapshot = await watchedUsers.once('value');
		let featureList = [];
		watchSnapshot.forEach(function(childSnapshot) {
			featureList.push(create_watch_feature(childSnapshot));
		});
		
		// Quickly remove everything
		// Only do this right before adding the new stuff,
		//   so that connection failures won't clear useful 
		//   but outdated data
		watchSource.clear(true);
		watchSource.addFeatures(featureList);
		_num_watched = featureList.length;
		num_watched_element.innerText = generate_compact_text(_num_watched);
		
		const clusterSnapshot = await clusters.once('value');
		let clusterList = [];
		clusterSnapshot.forEach(function(childSnapshot) {
			clusterList.push(create_cluster_feature(childSnapshot));
		});
		
		clusterSource.clear(true);
		clusterSource.addFeatures(clusterList);
		_num_clusters = clusterList.length;
		num_clusters_element.innerText = generate_compact_text(_num_clusters);
		
		clearAPIError();
	}
	catch(e)
	{
		throwAPIError(e);
	}
}

const connected = firebase.database().ref(".info/connected");
var _was_state_invalid = false;
function update_connection_state(snap){
	if(snap.val() == false){
		throwAPIError("Lost connection to server");
		_was_state_invalid = true;
	}
	else{
		if(_was_state_invalid){ // NOT the first run
			clearAPIError();
			// Do a full refresh of our data
			all_refresh();
			
		}
		_was_state_invalid = false;
	}
}
window.onload = async function(){
	update_points_settings();
	update_heatmap_settings();
	update_cluster_settings();
	update_source();
	//await watcher_refresh();
	// add callbacks
	watchedUsers.on('child_added', watcher_add);
	watchedUsers.on('child_changed', watcher_update);
	watchedUsers.on('child_removed', watcher_remove);
	
	// Clusters -- work in progress subject to change 
	clusters.on('child_added', cluster_add);
	clusters.on('child_changed', cluster_update);
	clusters.on('child_removed', cluster_remove);
	
	const updateBG = function(){
		map_element.style.backgroundImage = "none";
		map_element.style.backgroundColor = '#f2efe9';
		map_element.removeEventListener('wheel', updateBG); // event listener removes itself for perf
		map_element.removeEventListener('click', updateBG);
		toggle_sidebar.removeEventListener('click', updateBG);
	}
	map_element.addEventListener('wheel', updateBG);
	map_element.addEventListener('mousedown', updateBG);
	toggle_sidebar.addEventListener("click", updateBG);
	
	document.addEventListener("keydown", (e)=>{
		if(e.keyCode == 68){
			document.getElementById("dev_only").style.display = "initial";
		}
	});
	setTimeout(function(){connected.on("value", update_connection_state)}, 5000);
}

