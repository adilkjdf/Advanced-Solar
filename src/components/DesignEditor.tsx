// ... (previous imports remain the same)

const clearCurrentShape = () => {
  // Replace drawToolRef.current?.clear() with proper cleanup
  if (drawToolRef.current) {
    // Clear the current drawing geometry
    const currentGeom = drawToolRef.current.getCurrentGeometry();
    if (currentGeom) {
      currentGeom.remove();
    }
    
    // Clear temporary markers and lines
    if (ghostMarkerRef.current) ghostMarkerRef.current.remove();
    if (tempLineRef.current) tempLineRef.current.remove();
    if (tempLabelRef.current) tempLabelRef.current.remove();
    if (startMarkerRef.current) startMarkerRef.current.remove();
    
    // Reset refs
    ghostMarkerRef.current = null;
    tempLineRef.current = null;
    tempLabelRef.current = null;
    startMarkerRef.current = null;
    isClosingRef.current = false;
  }

  // Clear any temporary labels
  if (labelLayerRef.current) {
    const geomsToRemove = labelLayerRef.current.getGeometries().filter(g => {
      const props = g.getProperties();
      return !props?.isDistanceLabel;
    });
    labelLayerRef.current.removeGeometry(geomsToRemove);
  }
  
  setCurrentArea('0.0 ft²');
  setupDrawingListeners();
};

// ... (rest of the component remains the same)