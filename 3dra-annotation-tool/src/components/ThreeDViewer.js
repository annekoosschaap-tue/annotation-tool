import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import axios from 'axios';

const ThreeDViewer = ({ fileName, token }) => {
  const mountRef = useRef(null); // Ref to attach the renderer

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.5;

    // Load 3D model
    const loadModel = () => {
        axios.get(`http://localhost:8000/get_3d_dicom/${fileName}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            responseType: 'arraybuffer',  // Receive binary data
        })
        .then(response => {
            const geometry = new STLLoader().parse(response.data);
            console.log("STL file loaded successfully:", geometry);
            geometry.center(); // Centers the geometry
            geometry.computeBoundingBox();
            geometry.computeVertexNormals();

            const size = new THREE.Vector3();
            geometry.boundingBox.getSize(size);

            const scaleFactor = 1 / Math.max(size.x, size.y, size.z); // Normalize size
            geometry.scale(scaleFactor, scaleFactor, scaleFactor);

            const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, metalness: 0.3, roughness: 0.6 });
            const mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);
        })
        .catch(error => {
            console.error("Error loading STL:", error);
        });
    };

    loadModel();

    // Lighting
    const light = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(light);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // Cleanup function
    return () => {
        if (mountRef.current && renderer.domElement) {
          mountRef.current.removeChild(renderer.domElement);
        }
        renderer.dispose();
      };
    }, [fileName]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

export default ThreeDViewer;
