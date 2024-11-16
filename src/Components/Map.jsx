import React, { useEffect, useRef, useState, Suspense } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei'; // Import useGLTF
import { createRoot } from 'react-dom/client';
import '../../src/Map.css';

const Map = () => {
  const mapContainer = useRef(null);
  const [map, setMap] = useState(null);
  const [directions, setDirections] = useState(null);
  const [startLngLat, setStartLngLat] = useState(null);
  const [endLngLat, setEndLngLat] = useState(null);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [currentNotifications, setCurrentNotifications] = useState([]); // Notification stack
  const carMarkerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [visitedLandmarks, setVisitedLandmarks] = useState(new Set());
  const [landmarks, setLandmarks] = useState([]); // Dynamic landmarks state
  const [crossedLandmark, setCrossedLandmark] = useState(null);

  mapboxgl.accessToken = 'pk.eyJ1IjoidGhlY2FybG92ZXIiLCJhIjoiY20zaWZrM3kyMDBiaDJsczg1YTk4cno4MCJ9.maM3-4iCmrS7Lxs-CIxlqw';

  // Fetch directions from Mapbox API
  const fetchDirections = async (start, end) => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?access_token=${mapboxgl.accessToken}&geometries=geojson`
      );
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        setDirections(data.routes[0]);
      } else {
        alert('No routes found. Please try different locations.');
      }
    } catch (error) {
      console.error('Error fetching directions:', error);
    }
  };

  // Geocode addresses to coordinates
  const geocode = async (address) => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxgl.accessToken}`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        return data.features[0].geometry.coordinates;
      } else {
        alert('Invalid address. Please try again.');
      }
    } catch (error) {
      console.error('Error geocoding address:', error);
    }
  };

  // Handle origin and destination input
  const handleInputChange = async (e) => {
    e.preventDefault();
    if (!origin || !destination) {
      alert('Please provide both origin and destination.');
      return;
    }

    const originCoordinates = await geocode(origin);
    const destinationCoordinates = await geocode(destination);

    if (originCoordinates && destinationCoordinates) {
      setStartLngLat(originCoordinates);
      setEndLngLat(destinationCoordinates);
      fetchDirections(originCoordinates, destinationCoordinates);
    }
  };

  // Animate car movement
  const animateCar = (coordinates) => {
    let index = 0;

    const moveCar = () => {
      if (index < coordinates.length) {
        const [lng, lat] = coordinates[index];
        carMarkerRef.current.setLngLat([lng, lat]);
        checkLandmarkReach([lng, lat]);
        index++;
        animationFrameRef.current = requestAnimationFrame(moveCar);
      } else {
        cancelAnimationFrame(animationFrameRef.current);
        setCurrentNotifications((prev) => [...prev, 'You have reached your destination!']);
      }
    };

    moveCar();
  };

  // Check if car reached a landmark
  const checkLandmarkReach = (carPosition) => {
    landmarks.forEach((landmark) => {
      const distance = Math.sqrt(
        Math.pow(carPosition[0] - landmark.coordinates[0], 2) +
        Math.pow(carPosition[1] - landmark.coordinates[1], 2)
      );

      if (distance < 0.05) { // Proximity check
        if (!visitedLandmarks.has(landmark.name)) {
          setVisitedLandmarks((prev) => new Set(prev).add(landmark.name));
          setCurrentNotifications((prev) => [...prev, `You have crossed the landmark: ${landmark.name}`]);
          setCrossedLandmark(landmark);

          // Create a popup with the landmark information
          const popup = new mapboxgl.Popup({ closeOnClick: true })
            .setLngLat(landmark.coordinates)
            .setHTML(`<div><strong>${landmark.name}</strong></div>`);

          new mapboxgl.Marker()
            .setLngLat(landmark.coordinates)
            .setPopup(popup)
            .addTo(map);

          // Clear notification after 5 seconds
          setTimeout(() => {
            setCurrentNotifications((prev) => prev.filter((notif) => notif !== `You have crossed the landmark: ${landmark.name}`));
          }, 5000);
        }
      }
    });
  };

  // Render 3D model using GLTF file
  const LandmarkModel = ({ url }) => {
    const { scene } = useGLTF(url); // Load GLTF model from URL
    return <primitive object={scene} scale={1} />; // Render the model, scale it if needed
  };

  // Add route layer on the map
  const addRouteLayer = () => {
    if (directions && map) {
      if (map.getLayer('route')) {
        map.removeLayer('route');
        map.removeSource('route');
      }

      map.addLayer({
        id: 'route',
        type: 'line',
        source: {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: directions.geometry,
          },
        },
        paint: {
          'line-color': '#0074D9',
          'line-width': 8,
        },
      });

      if (!carMarkerRef.current) {
        carMarkerRef.current = new mapboxgl.Marker()
          .setLngLat(startLngLat)
          .addTo(map);
      }

      const routeCoordinates = directions.geometry.coordinates;
      animateCar(routeCoordinates);
    }
  };

  // Fetch landmarks dynamically from Mapbox Geocoding API
  const fetchLandmarks = async () => {
    const boundingBox = '67.68,6.55,97.395,35.67'; // India bounding box
    const query = 'landmark'; // Query for landmarks

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?bbox=${boundingBox}&limit=50&access_token=${mapboxgl.accessToken}`
      );
      const data = await response.json();
      if (data.features) {
        setLandmarks(
          data.features.map((feature) => ({
            name: feature.text,
            coordinates: feature.geometry.coordinates,
          }))
        );
      }
    } catch (error) {
      console.error('Error fetching landmarks:', error);
    }
  };

  // Add landmarks to the map
  const addLandmarksToMap = () => {
    if (map && landmarks.length > 0) {
      landmarks.forEach((landmark) => {
        const marker = new mapboxgl.Marker()
          .setLngLat(landmark.coordinates)
          .setPopup(
            new mapboxgl.Popup({ closeOnClick: true }).setHTML(`
              <div style="text-align: center;">
                <p><strong>${landmark.name}</strong></p>
              </div>
            `)
          )
          .addTo(map);
      });
    }
  };

  // Initialize map
  useEffect(() => {
    const initializeMap = () => {
      const mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [78.9629, 20.5937], // Center of India
        zoom: 5,
      });

      mapInstance.on('load', () => {
        setMap(mapInstance);
        fetchLandmarks(); // Fetch landmarks when map loads
      });
    };

    if (!map) {
      initializeMap();
    }

    return () => {
      if (map) {
        map.remove();
      }
    };
  }, [map]);

  // Add landmarks when fetched
  useEffect(() => {
    if (map && landmarks.length > 0) {
      addLandmarksToMap();
    }
  }, [landmarks]);

  // Add route layer when directions are fetched
  useEffect(() => {
    if (directions) {
      addRouteLayer();
    }
  }, [directions]);

  return (
    <div className="app-container">
      <div ref={mapContainer} style={{ width: '100%', height: '100vh' }}></div>

      <div className="form-container">
        <input
          type="text"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="Enter origin"
        />
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Enter destination"
        />
        <button onClick={handleInputChange}>Get Directions</button>
      </div>

      {currentNotifications.length > 0 && (
        <div className="notification-stack">
          {currentNotifications.map((notif, index) => (
            <div key={index} className="notification">
              {notif}
            </div>
          ))}
        </div>
      )}

      <div className="landmark-display">
        {crossedLandmark && (
          <div>
            <h3>{crossedLandmark.name}</h3>
            <Canvas style={{ width: '500px', height: '500px', border: '2px solid #333' }}>
              <Suspense fallback={null}>
                <ambientLight intensity={1} />
                <pointLight position={[10, 10, 10]} />
                <LandmarkModel url="/models/tt.glb" /> 
                <OrbitControls enableZoom={true} />
              </Suspense>
            </Canvas>
          </div>
        )}
      </div>
    </div>
  );
};

export default Map;
