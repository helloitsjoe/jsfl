(function()
{
	// This is ugly, but necessary (including not using the dom
	// variables defined directly below) to avoid a crash caused by
	// calling this command (specifically dom.union()) inside a symbol.
	if (fl.getDocumentDOM().getTimeline().layers[0].name !== "vectors") {
		copyAllToFile(true);
	}
	
	var dom = fl.getDocumentDOM();

	if (!dom) return;

	var timeline = dom.getTimeline();
	var folderLayer = timeline.layers[0];
	
	var i, bitmapLayer, bitmap, frame;
	

	// Undo conversion
	if (folderLayer.name == "vectors")
	{
		var bitmapIndex = timeline.layers.length - 1;
		var bitmapLayer = timeline.layers[bitmapIndex];
		
		// Flatten layers to one layer
		for (var i = 1; i < timeline.frameCount; i++)
		{
			var bitmapIndex = timeline.layers.length - 1;
			var frame = timeline.layers[bitmapIndex].frames[i];
			timeline.setSelectedLayers(bitmapIndex - 1);

			// Check the status of the current frame
			// 0 = no keyframes
			// 1 = keyframes no elements
			// 2 = keyframes + elements
			status = frameStatus(bitmapIndex - 1, i);

			if (status === 0){
				continue;
			} else {
				selectFrame(bitmapIndex, i);
				timeline.convertToBlankKeyframes();
				dom.selectAll();
				dom.clipCut();
				selectFrame(bitmapIndex, i);
				dom.clipPaste(true);
				timeline.deleteLayer(bitmapIndex - 1);
			}
		}

		// Delete all the bitmaps
		for(i = 0; i < bitmapLayer.frames.length; i++)
		{
			frame = bitmapLayer.frames[i]
			if (frame.elements.length)
			{
				bitmap = frame.elements[0].libraryItem;
				dom.library.deleteItem(bitmap.name);
			}
		}

		// Delete the vectors layer
		folderLayer.visible = true;
		folderLayer.locked = false;
		folderLayer.layerType = "normal";
		timeline.deleteLayer(0);
		
		// Delete the bitmap layer
		timeline.deleteLayer(timeline.layers.length - 1);
		
		// Set guided layers back to normal
		for (i = timeline.layers.length - 1; i >= 0; i--)
		{
			timeline.layers[i].layerType = "normal";
		}
		return;
	}
	
	var bitmapName;
	var scale = localToGlobalScale();

	// The prompt was cancelled
	if (scale === null)
	{
		return;
	}

	// If we're inside a symbol, use the name of the
	if (timeline.libraryItem)
	{
		var item = timeline.libraryItem;
		bitmapName = item.name;
		var index = bitmapName.indexOf('/');
		if (index > -1)
		{
			bitmapName = bitmapName.substr(index + 1);
		}
	}
	else
	{
		if (!dom.name)
		{
			return alert("Please save document first.");
		}

		// Chop of the ".fla" or ".xfl" extension
		bitmapName = dom.name.substr(0, dom.name.lastIndexOf('.'));
	}

	// The number of layers
	var origLength = timeline.layers.length;

	// Copy the current layers
	timeline.copyLayers(0, origLength - 1);

	// Create a new folder for the hidden, guided, locked vector layers
	var folderLayerIndex = timeline.addNewLayer('vectors', 'folder');

	// Make sure the folder is first
	timeline.reorderLayer(folderLayerIndex, 0);

	// Copy to the folder
	timeline.pasteLayers(0);

	// Guide out the child layers
	for(i = 1; i <= origLength; i++)
	{
		timeline.layers[i].layerType = "guide";
	}

	// Lock and hide all the vectors
	var parentLayer = timeline.layers[0];
	parentLayer.visible = false;
	parentLayer.locked = true;
    
	// Add a new bitmap layer above the copied layers
	var bitmapLayerIndex = origLength + 1;
	timeline.setSelectedLayers(bitmapLayerIndex);
	timeline.addNewLayer('bitmap', 'normal', true);
	bitmapLayer = timeline.layers[bitmapLayerIndex];

    var EMPTY = -1;
    var KEYFRAME = 1;
     
    var status;
    var numFrames = timeline.frameCount;
     
    // Flatten vector art if on multiple layers
    flattenMultipleLayers();

    // Convert all vectors to shape objects for punching out
    for (var i = 0; i < timeline.frameCount;) {
		var frame = timeline.layers[bitmapLayerIndex].frames[i];
        selectFrame(bitmapLayerIndex, i)
        dom.union();
		i += frame.duration;
    }
	
    // Copy layer and create editing layers
    timeline.copyLayers(bitmapLayerIndex);
    timeline.setSelectedLayers(bitmapLayerIndex);
    
    var editLayerIndex = timeline.pasteLayers(bitmapLayerIndex + 1);
    timeline.layers[editLayerIndex].name = 'edit';
	
    // Create a third layer to keep original artwork
    var secondEditLayerIndex = timeline.pasteLayers(editLayerIndex + 1);
    timeline.layers[secondEditLayerIndex].name = 'secondEdit';

    // Turn off original layers visibility
    for (var i = secondEditLayerIndex + 1; i < timeline.layers.length; i++)
    {
        timeline.layers[i].visible = false;
    }
	
    for (var i = 0; i < timeline.frameCount - 1;){
		var frame = timeline.layers[bitmapLayerIndex].frames[i];
        removeOverlap(i);
		i += frame.duration;
    };
    
    // Run bitmap conversion
    convertToBitmap();

	// Delete the rest of the layers
	while(bitmapLayerIndex + 1 < timeline.layers.length)
	{
		timeline.deleteLayer(timeline.layers.length - 1);
	}
	
	// Stagger frames to build overlapping artwork
	for (var i = timeline.frameCount - 1; i >= 1; i--) {
		var lastLayerIndex = timeline.layers.length - 1;
		var frame = timeline.layers[lastLayerIndex].frames[i];
	
		// Check the status of the current frame
		// 0 = no keyframes
		// 1 = keyframes no elements
		// 2 = keyframes + elements
		status = frameStatus(lastLayerIndex, i);
	
		if (status === 0) {
			continue;
		} else {
			selectFrame(timeline.layers.length - 1, i);
			timeline.cutFrames(i);
			timeline.clearKeyframes(i, timeline.frameCount);
			timeline.addNewLayer();
			timeline.pasteFrames(i);
		}
	}
	
	
	// This is also necessary for avoiding a crash (see first comment)
	if (folderLayer.name !== "vectors") {
		copyAllToFile(false);
	}
	
	
	// FUNCTIONS ---------------------------------------------
	
	
    // If an animation is made of many overlapping redundant shapes, remove the redundant art
    function removeOverlap(i){
		fl.outputPanel.clear();
		var bitmapLayer = timeline.layers[bitmapLayerIndex];
		var frame = bitmapLayer.frames[i]
		var nextFrame = bitmapLayer.frames[i + frame.duration]
		if (!nextFrame) {
			return;
		}
		
        // Punch the first frame out of the second frame
		selectFrame(secondEditLayerIndex, i);
        dom.clipCopy();
        selectFrame(editLayerIndex, i + frame.duration);
        dom.clipPaste(true);
        selectFrame(editLayerIndex, i + frame.duration);
        dom.punch(); // <-- TODO: Is this crashing because Flash is in a certain state when it's trying to run?

        // Add stroke to expand shape by 10pt (color not important)
        // selectFrame(editLayerIndex, i + frame.duration);
		dom.setFillColor('#ffffff');
        dom.setStroke('#ffffff', 10, 'solid');
        dom.convertLinesToFills();
		
        // Punch the expanded second frame out of the original first frame
        selectFrame(editLayerIndex, i + frame.duration);
        dom.clipCopy();
        selectFrame(secondEditLayerIndex, i);
        dom.clipPaste(true);
        selectFrame(secondEditLayerIndex, i);
        dom.punch();
		
        // Punch the smaller first frame out of the original second frame
        selectFrame(secondEditLayerIndex, i);
        dom.clipCopy();
        selectFrame(bitmapLayerIndex, i + frame.duration);
        dom.clipPaste(true);
        selectFrame(bitmapLayerIndex, i + frame.duration);
        dom.punch();

        // A = frame 1 art
        // B = frame 2 art
        // Bp = B - A
        // expand Bp 5pt
        // Ap = A - Bp
        // Boverlap = B - Ap
    }
	
	function copyAllToFile(newFile) {
		var dom = fl.getDocumentDOM();
		var timeline = dom.getTimeline();
		
		for (var i = 0; i < timeline.layers.length; ++i) {
			timeline.setSelectedLayers(i, false)
		}

		timeline.copyLayers();
		if (newFile === true) {
			fl.createDocument();
		} else {
			fl.closeDocument(fl.documents[fl.documents.length - 1], false);
		}
		var newTimeline = fl.getDocumentDOM().getTimeline();
		newTimeline.pasteLayers();
		newTimeline.deleteLayer(newTimeline.layers.length - 1);
	}
	
	function selectFrame(layer, frame)
	{
		// Select the current frame
		timeline.setSelectedLayers(layer);
		timeline.setSelectedFrames(frame, frame + 1);
	}
    
    function flattenMultipleLayers() {
        // Select the contents of the original layers
        for(i = numFrames - 1; i >=0 ; --i) {

            timeline.currentFrame = i;

            // Check the status of the current frame
            // 0 = no keyframes
            // 1 = keyframes no elements
            // 2 = keyframes + elements
            status = frameStatus(bitmapLayerIndex + 1, i);

            // Current frame has no keyframes, no content
            if (status < KEYFRAME)
            {
                if (status == EMPTY)
                {
                    timeline.setSelectedLayers(bitmapLayerIndex);
                    timeline.insertBlankKeyframe();
                }
                continue;
            }

            //ensure that there is a blank keyframe there to paste into
            selectFrame(bitmapLayerIndex, i);
            if (i > 0) timeline.insertBlankKeyframe(); // don't insert on the first frame

            // Copy all the frames and paste on the bitmap layer
            dom.selectAll();
            dom.clipCopy();
            selectFrame(bitmapLayerIndex, i);
            dom.clipPaste(true);
        }
    }
    
    function convertToBitmap() {
        for(i = numFrames - 1; i >=0 ; --i) {
			selectFrame(bitmapLayerIndex, i);

            // Scale the selection
            dom.transformSelection(scale, 0, 0, scale);

            // Convert the selection to a bitmap
            dom.convertSelectionToBitmap();

            // Undo scale to the selection
            var bitmap = bitmapLayer.frames[i].elements[0];
            dom.selection = [bitmap];
            dom.transformSelection(1/scale, 0, 0, 1/scale);

            // Get the library item from the instance and rename it
            if (bitmapName)
            {
                var bitmapItem = bitmap.libraryItem;
                bitmapItem.name = bitmapName + (i+1);
            }
        }
    }

	// Function to check the current status of a frame
	// -1 = no content
	// 0 = content but no keyframe
	// 1 = keyframes + content
	function frameStatus(index, currentFrame)
	{
		var layer = timeline.layers[index];
		var status = -1; // empty
		var frame;
		while(layer)
		{
			// if (currentFrame >= layer.frameCount) continue;

			frame = layer.frames[currentFrame];

			// Has content on it
			if (frame && frame.elements.length)
			{
				status = 0;
				if (frame.startFrame == i)
				{
					status = 1;
					break;
				}
			}
			layer = timeline.layers[++index];
		}
		return status;
	}
    

	function localToGlobalScale()
	{
		var doc = fl.getDocumentDOM();

		if (!doc) return;

		var scaleX = 1;
		var scaleY = 1;
		var scale;

		var timeline = doc.getTimeline();
		var originalItem = libraryItem = timeline.libraryItem;
		var steps = 0;

		// We're on the main stage, ignore the rest set to 100%
		if (!libraryItem)
		{
			return 1;
		}

		var scaleKey = 'copyLayersToBitmapScale';

		while(libraryItem)
		{
			// Go "up" a nested level
			doc.exitEditMode();
			steps++;

			// Get the new timeline
			timeline = doc.getTimeline();

			var element = doc.selection.length ? doc.selection[0] : null;
			if (element && element.libraryItem == libraryItem)
			{
				scaleX *= element.scaleX;
				scaleY *= element.scaleY;
			}
			else
			{
				fl.outputPanel.clear();
				fl.trace("WARNING: Unable to measure the relative scale either because the current item was opened directly from the library ");
				fl.trace("         or because a tween is preventing the exit and enter of the symbol. Prompting for scale...");

				// Go back into the symbol after we exited
				doc.library.editItem(originalItem.name);

				// Get the saved scale amount
				var defaultScale = originalItem.hasData(scaleKey) ?
					originalItem.getData(scaleKey) : 1;

				// Aask for the scale
				var scale = prompt("Output scale", defaultScale);

				if (!scale) return null;

				scale = parseFloat(scale);

				// Save the scale to use at the default later on
				originalItem.addData(scaleKey, "double", scale);

				return scale;
			}
			libraryItem = timeline.libraryItem;
		}

		// Go back to where we started
		if (steps)
		{
			while(steps--)
			{
				if (doc.selection.length)
				{
					doc.enterEditMode("inPlace");
				}
			}
		}

		// Do a little rounding
		scaleX = Math.round(scaleX * 100000) / 100000;
		scaleY = Math.round(scaleY * 100000) / 100000;

		// Get the larger scale size
		scale = Math.max(scaleX, scaleY);

		// Save the scale to the library item if we have it
		if (originalItem)
		{
			// Save the scale to use at the default later on
			originalItem.addData(scaleKey, "double", scale);
		}

		// Get the largest scale
		return scale;
	}

}());



