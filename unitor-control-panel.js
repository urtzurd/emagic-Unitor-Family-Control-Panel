let midiAccess = null;
let selectedOutputPort = null;
let selectedInputPort = null;
let deviceDetected = false;
let animationInProgress = false;
let messageListeners = []; // Chain of message listeners
let detectedDeviceInfo = null; // Store device type and firmware info
let currentPatch = 1; // Currently selected patch (1-64)
let patchData = {}; // Store routing data for all patches
let clipboardBuffer = null; // Buffer for copy/paste operations

const mainContainer = document.getElementById('mainContainer');
const detectionPanel = document.getElementById('detectionPanel');
const patchesPanel = document.getElementById('patchesPanel');
const copyBtn = document.getElementById('copyBtn');
const pasteBtn = document.getElementById('pasteBtn');
const resetBtn = document.getElementById('resetBtn');

const outputSelect = document.getElementById('outputSelect');
const inputSelect = document.getElementById('inputSelect');
const scanButton = document.getElementById('scanButton');
const nextButton = document.getElementById('nextButton');
const statusMessage = document.getElementById('statusMessage');

// Constants
const RESPONSE_TIMEOUT_MS = 1000; // 1 second timeout for message responses

// Master MIDI message handler that chains to all registered listeners
function masterMessageHandler(event) {
    // Always call debug logger first
    debugMessageHandler(event);

    // Then call all other registered listeners in order
    for (const listener of messageListeners) {
        listener(event);
    }
}

// Debug handler - always first in chain
function debugMessageHandler(event) {
    const data = Array.from(event.data);
    // Only log SysEx messages (start with 0xF0)
    if (data[0] === 0xF0) {
        logDebug('received', data);
    }
}

// Add a listener to the chain
function addMessageListener(listener) {
    messageListeners.push(listener);
}

// Remove a listener from the chain
function removeMessageListener(listener) {
    const index = messageListeners.indexOf(listener);
    if (index > -1) {
        messageListeners.splice(index, 1);
    }
}

// Clear all listeners (except debug which is in master handler)
function clearMessageListeners() {
    messageListeners = [];
}

// Debug console functions - now only logs to JavaScript console
function getTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'}) +
        '.' + now.getMilliseconds().toString().padStart(3, '0');
}

function logDebug(direction, data) {
    const timestamp = getTimestamp();
    const directionLabel = direction === 'sent' ? '→ SENT:' : '← RECV:';
    const hexData = toHexString(data);
    console.log(`[${timestamp}] ${directionLabel} ${hexData}`);
}

function logInfo(message) {
    const timestamp = getTimestamp();
    console.log(`[${timestamp}] ${message}`);
}

// Debug listener: logs whenever a port's "state" or "connection" attribute changes.
// Attached once per port using a stable function reference, so re-selecting the
// same port from the dropdown does not register duplicate listeners.
function handlePortStateChange(event) {
    const port = event.port;
    logInfo(`Port state change: ${port.name} (${port.type}) - state: "${port.state}", connection: "${port.connection}"`);
}

// Ensure a port's "connection" attribute is "open" before we use it for I/O,
// opening it (and awaiting completion) if it is not.
async function ensurePortOpen(port, label) {
    if (port.connection !== 'open') {
        logInfo(`${label} port connection is "${port.connection}" (state: "${port.state}") - opening...`);
        await port.open();
        logInfo(`${label} port connection is now "${port.connection}" (state: "${port.state}")`);
    }
}

// Initialize Web MIDI API
async function initMIDI() {
    try {
        midiAccess = await navigator.requestMIDIAccess({sysex: true});
        updateDeviceList();
        showStatus('MIDI access granted. Select a device to scan.', 'info');

        // Listen for device changes
        midiAccess.addEventListener('statechange', updateDeviceList);
    } catch (error) {
        showStatus('Failed to access MIDI devices. Make sure you granted MIDI permissions.', 'error');
        console.error('MIDI Access Error:', error);
    }
}

// Update the device dropdown list
function updateDeviceList() {
    // Save current selections
    const currentOutputValue = outputSelect.value;
    const currentInputValue = inputSelect.value;

    // Update output devices
    outputSelect.innerHTML = '<option value="">-- Select a MIDI Output --</option>';

    const outputs = Array.from(midiAccess.outputs.values());

    if (outputs.length === 0) {
        outputSelect.innerHTML = '<option value="">No MIDI output devices found</option>';
        outputSelect.disabled = true;
    } else {
        outputs.forEach((output, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${output.name} (${output.manufacturer || 'Unknown'})`;
            outputSelect.appendChild(option);
        });
        outputSelect.disabled = false;

        // Restore previous selection if it still exists
        if (currentOutputValue !== '' && currentOutputValue < outputs.length) {
            outputSelect.value = currentOutputValue;
        }
    }

    // Update input devices
    inputSelect.innerHTML = '<option value="">-- Select a MIDI Input --</option>';

    const inputs = Array.from(midiAccess.inputs.values());

    if (inputs.length === 0) {
        inputSelect.innerHTML = '<option value="">No MIDI input devices found</option>';
        inputSelect.disabled = true;
    } else {
        inputs.forEach((input, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${input.name} (${input.manufacturer || 'Unknown'})`;
            inputSelect.appendChild(option);
        });
        inputSelect.disabled = false;

        // Restore previous selection if it still exists
        if (currentInputValue !== '' && currentInputValue < inputs.length) {
            inputSelect.value = currentInputValue;
        }
    }

    // Update scan button state
    updateScanButtonState();
}

// Update button state based on device selections and detection
function updateScanButtonState() {
    const bothSelected = (selectedOutputPort !== null && selectedInputPort !== null);

    if (deviceDetected && !animationInProgress) {
        // Device detected - transition from scan to next button
        animationInProgress = true;

        // Step 1: Disable scan button and add fading class (fades background and opacity)
        scanButton.disabled = true;
        scanButton.classList.add('button-disabled');

        setTimeout(() => {
            // Step 2: Hide scan button, show next button (disabled/faded)
            scanButton.style.display = 'none';
            scanButton.classList.remove('button-disabled');

            nextButton.style.display = 'block';
            nextButton.disabled = true;
            nextButton.classList.add('button-disabled'); // Starts faded

            // Step 3: Enable next button (reverse fade animation)
            setTimeout(() => {
                nextButton.classList.remove('button-disabled');
                nextButton.disabled = false;
            }, 50);
        }, 600); // Wait for scan button to fade to disabled state

    } else if (!deviceDetected) {
        // No device detected - show scan button, hide next button (no animation)
        animationInProgress = false;
        scanButton.disabled = !bothSelected;
        scanButton.style.display = 'block';
        scanButton.classList.remove('button-disabled');
        nextButton.style.display = 'none';
        nextButton.classList.remove('button-disabled');
    }
}

// Handle output device selection
outputSelect.addEventListener('change', async (e) => {
    if (e.target.value === '') {
        selectedOutputPort = null;
        logInfo('Output device deselected');
    } else {
        const outputs = Array.from(midiAccess.outputs.values());
        selectedOutputPort = outputs[e.target.value];
        logInfo(`Output device selected: ${selectedOutputPort.name} (manufacturer: ${selectedOutputPort.manufacturer || 'Unknown'}, id: ${selectedOutputPort.id})`);

        // Debug: log state/connection changes for this port
        selectedOutputPort.addEventListener('statechange', handlePortStateChange);

        // Open the port as soon as it's selected, rather than waiting until send time
        try {
            await ensurePortOpen(selectedOutputPort, 'Output');
        } catch (error) {
            logInfo(`Failed to open output port: ${error.message}`);
        }
    }
    deviceDetected = false; // Reset detection state when device changes
    updateScanButtonState();
});

// Handle input device selection
inputSelect.addEventListener('change', async (e) => {
    // Remove master handler from previous input if any
    if (selectedInputPort) {
        selectedInputPort.onmidimessage = null;
    }

    if (e.target.value === '') {
        selectedInputPort = null;
        logInfo('Input device deselected');
    } else {
        const inputs = Array.from(midiAccess.inputs.values());
        selectedInputPort = inputs[e.target.value];

        logInfo(`Input device selected: ${selectedInputPort.name} (manufacturer: ${selectedInputPort.manufacturer || 'Unknown'}, id: ${selectedInputPort.id})`);

        // Set master message handler using onmidimessage property to ensure
        // the port is properly opened and ready to receive messages
        selectedInputPort.onmidimessage = masterMessageHandler;

        // Debug: log state/connection changes for this port
        selectedInputPort.addEventListener('statechange', handlePortStateChange);

        // Open the port as soon as it's selected, rather than waiting until send time
        try {
            await ensurePortOpen(selectedInputPort, 'Input');
        } catch (error) {
            logInfo(`Failed to open input port: ${error.message}`);
        }
    }
    deviceDetected = false; // Reset detection state when device changes
    updateScanButtonState();
});

// Show status message
function showStatus(message, type = 'info') {
    statusMessage.innerHTML = `<div class="status ${type}">${message}</div>`;
}

// Convert array to hex string
function toHexString(arr) {
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

// Parse firmware version from ASCII bytes
function parseFirmwareVersion(bytes) {
    // Convert ASCII bytes to string (e.g., [0x32, 0x30, 0x32] -> "202" -> "2.0.2")
    const versionString = String.fromCharCode(...bytes);

    // Format as X.Y.Z
    if (versionString.length === 3) {
        return `${versionString[0]}.${versionString[1]}.${versionString[2]}`;
    }
    return versionString;
}

// Check if response matches expected pattern
function isUnitor8ScanResponse(data) {
    // Expected: F0 00 20 31 64 04 00 40 F7
    const expected = [0xF0, 0x00, 0x20, 0x31, 0x64, 0x04, 0x00, 0x40, 0xF7];

    if (data.length !== expected.length) return false;

    for (let i = 0; i < expected.length; i++) {
        if (data[i] !== expected[i]) return false;
    }

    return true;
}

// Check if response is firmware version and extract device type
function checkFirmwareVersionResponse(data) {
    // Expected pattern: F0 00 20 31 64 7B 00 XX [ASCII bytes] F7
    // XX = 00 for Unitor8, XX = 01 for AMT8, XX = 02 for MT4
    if (data.length < 9) return null;
    if (data[0] !== 0xF0) return null;
    if (data[1] !== 0x00 || data[2] !== 0x20 || data[3] !== 0x31) return null;
    if (data[4] !== 0x64 || data[5] !== 0x7B) return null;
    if (data[6] !== 0x00) return null;
    if (data[data.length - 1] !== 0xF7) return null;

    const deviceTypeByte = data[7];
    let deviceType = 'Unknown';

    if (deviceTypeByte === 0x00) {
        deviceType = 'Unitor8';
    } else if (deviceTypeByte === 0x01) {
        deviceType = 'AMT8';
    } else if (deviceTypeByte === 0x02) {
        deviceType = 'MT4';
    }

    return {
        isValid: true,
        deviceType: deviceType,
        deviceTypeByte: deviceTypeByte
    };
}

// Request firmware version with 1s timeout
// Scan for Unitor8/AMT8 or MT4
async function scanDevice() {
    scanButton.disabled = true;

    // Use requestAnimationFrame to ensure transition triggers
    requestAnimationFrame(() => {
        scanButton.classList.add('button-disabled');
    });

    const scanMessage = [0xF0, 0x00, 0x20, 0x31, 0x64, 0x03, 0x00, 0x7F, 0xF7];
    const firmwareRequestMsg = [0xF0, 0x00, 0x20, 0x31, 0x64, 0x0B, 0x00, 0x00, 0xF7];

    logInfo('Sending initial scan message');
    logDebug('sent', scanMessage);

    try {
        // Send both messages immediately without delay
        // MT4 requires both messages to be sent without delay
        let firmwareInfo = null;
        let responseReceived = false;

        if (!selectedInputPort || !selectedOutputPort) {
            throw new Error('No input/output port available');
        }

        // Ensure both ports are fully open before sending — the dropdown handlers
        // already open ports on selection, but this is a safety net in case a
        // port's connection dropped (e.g. device unplugged/replugged) in the meantime.
        await ensurePortOpen(selectedOutputPort, 'Output');
        await ensurePortOpen(selectedInputPort, 'Input');

        const responsePromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                removeMessageListener(scanHandler);
                if (!responseReceived) {
                    reject(new Error('No response received from device'));
                }
            }, RESPONSE_TIMEOUT_MS);

            const scanHandler = (event) => {
                const data = Array.from(event.data);

                // Check for Unitor8/AMT8 scan response
                if (isUnitor8ScanResponse(data)) {
                    logInfo('Unitor8/AMT8 scan response detected');
                }

                // Check for firmware version response (works for all device types)
                const firmwareCheck = checkFirmwareVersionResponse(data);
                if (firmwareCheck && firmwareCheck.isValid) {
                    responseReceived = true;
                    clearTimeout(timeout);
                    removeMessageListener(scanHandler);

                    // Extract firmware version bytes (between byte 8 and F7)
                    const versionBytes = data.slice(8, data.length - 1);
                    const version = parseFirmwareVersion(versionBytes);

                    logInfo(`Device detected: ${firmwareCheck.deviceType} with firmware version ${version}`);

                    resolve({
                        version: version,
                        deviceType: firmwareCheck.deviceType,
                        deviceTypeByte: firmwareCheck.deviceTypeByte
                    });
                }
            };

            // Add scan handler to listener chain
            addMessageListener(scanHandler);

            // Send both messages immediately
            // MT4 requires both messages to be sent without delay
            selectedOutputPort.send(scanMessage);
            logInfo('Sending firmware request message');
            logDebug('sent', firmwareRequestMsg);
            selectedOutputPort.send(firmwareRequestMsg);
        });

        firmwareInfo = await responsePromise;

        // Device successfully detected - disable scan, enable next
        deviceDetected = true;
        detectedDeviceInfo = firmwareInfo; // Store for later use
        updateScanButtonState();

        showStatus(`Successfully detected ${firmwareInfo.deviceType} with firmware version ${firmwareInfo.version}`, 'success');

    } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
        logInfo(`Scan error: ${error.message}`);
    } finally {
        // Re-enable button and remove disabled styling (only if device not detected)
        // If device was detected, updateScanButtonState handles the transition
        if (!deviceDetected) {
            scanButton.disabled = false;
            scanButton.classList.remove('button-disabled');
        }
    }
}

// Scan button click handler
scanButton.addEventListener('click', scanDevice);

// Next button click handler
nextButton.addEventListener('click', () => {
    logInfo('Next button clicked - showing patches panel');
    showPatchesPanel();
});

// Show patches panel
function showPatchesPanel() {
    // Expand container
    mainContainer.classList.add('wide');

    // Hide detection panel, show patches panel
    detectionPanel.style.display = 'none';
    patchesPanel.style.display = 'block';

    // Populate header with logo and device name
    const header = document.getElementById('patchesPanelHeader');
    const logo = document.querySelector('#detectionPanel h1 svg').cloneNode(true);
    header.innerHTML = '';
    header.appendChild(logo);
    const titleText = document.createTextNode(detectedDeviceInfo.deviceType + ' Control Panel');
    header.appendChild(titleText);

    // Generate patch list and matrix based on device
    generatePatchList();
    generateRoutingMatrix();

    // Lock the tab panel to the Patches tab's size so switching tabs doesn't resize the window
    const tabPaneWrapper = document.querySelector('.tab-pane-wrapper');
    tabPaneWrapper.style.width = tabPaneWrapper.offsetWidth + 'px';
    tabPaneWrapper.style.height = tabPaneWrapper.offsetHeight + 'px';
}

// Generate list of 32 patches
function generatePatchList() {
    const patchList = document.getElementById('patchList');
    patchList.innerHTML = '';

    for (let i = 1; i <= 32; i++) {
        const patchItem = document.createElement('div');
        patchItem.className = 'patch-item' + (i === 1 ? ' selected' : '');
        patchItem.textContent = `Patch ${i}`;
        patchItem.dataset.patch = i;

        patchItem.addEventListener('click', () => {
            // Update selection
            document.querySelectorAll('.patch-item').forEach(p => p.classList.remove('selected'));
            patchItem.classList.add('selected');
            currentPatch = i;
            requestPatchData(i);
        });

        patchList.appendChild(patchItem);
    }

    // Initialize all patches with empty routing
    for (let i = 1; i <= 32; i++) {
        patchData[i] = {};
    }

    // Request first patch data
    requestPatchData(1);
}

// Generate routing matrix based on device type
function generateRoutingMatrix() {
    const matrixContainer = document.getElementById('matrixContainer');
    matrixContainer.innerHTML = '';

    if (!detectedDeviceInfo) return;

    let numInputs, numOutputs;

    if (detectedDeviceInfo.deviceType === 'MT4') {
        numInputs = 2;
        numOutputs = 4;
    } else {
        // Unitor8 or AMT8
        numInputs = 8;
        numOutputs = 8;
    }

    // Output labels
    const outputLabels = document.createElement('div');
    outputLabels.className = 'output-labels';
    for (let o = 1; o <= numOutputs; o++) {
        const label = document.createElement('div');
        label.className = 'output-label';
        label.textContent = `Out ${o}`;
        outputLabels.appendChild(label);
    }
    matrixContainer.appendChild(outputLabels);

    // Create matrix grid
    const matrixGrid = document.createElement('div');
    matrixGrid.className = 'matrix-grid';

    for (let i = 1; i <= numInputs; i++) {
        const row = document.createElement('div');
        row.className = 'matrix-row';

        // Input label
        const label = document.createElement('div');
        label.className = 'matrix-label';
        label.textContent = `In ${i}`;
        row.appendChild(label);

        // Checkboxes for each output
        for (let o = 1; o <= numOutputs; o++) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'matrix-checkbox';
            checkbox.dataset.input = i;
            checkbox.dataset.output = o;

            checkbox.addEventListener('change', () => {
                savePatchRouting(i, o, checkbox.checked);
            });

            row.appendChild(checkbox);
        }

        matrixGrid.appendChild(row);
    }

    matrixContainer.appendChild(matrixGrid);
}

// Save routing for current patch
// Request patch data from device
async function requestPatchData(patchNumber) {
    if (!selectedOutputPort || !selectedInputPort) {
        logInfo(`Cannot request patch ${patchNumber} - no MIDI ports selected`);
        return;
    }

    // Make sure both ports are open before we send/expect a response
    await ensurePortOpen(selectedOutputPort, 'Output');
    await ensurePortOpen(selectedInputPort, 'Input');

    // Request Patch SysEx message: F0 00 20 31 64 12 00 00 [patch-1] F7
    // Patch number is 0-indexed in the message (0x00 to 0x1F for patches 1-32)
    const requestPatchMsg = [0xF0, 0x00, 0x20, 0x31, 0x64, 0x12, 0x00, 0x00, patchNumber - 1, 0xF7];

    logInfo(`Requesting patch ${patchNumber}`);
    logDebug('sent', requestPatchMsg);

    // Set up listener for patch response
    const patchHandler = (event) => {
        const data = Array.from(event.data);

        // Check if this is a patch response
        const patchResponse = parsePatchResponse(data);
        if (patchResponse && patchResponse.patchNumber === patchNumber) {
            logInfo(`Received patch ${patchNumber} data`);

            // Update matrix with routing data
            updateMatrixFromPatchData(patchResponse.routing);

            // Remove this handler after receiving response
            removeMessageListener(patchHandler);
        }
    };

    // Add handler to listener chain
    addMessageListener(patchHandler);

    // Send request
    selectedOutputPort.send(requestPatchMsg);

    // Set timeout to remove handler if no response
    setTimeout(() => {
        removeMessageListener(patchHandler);
    }, RESPONSE_TIMEOUT_MS);
}

// Parse patch response message
function parsePatchResponse(data) {
    // Expected pattern: F0 00 20 31 64 7A 00 00 [patch-num] 00 [routing-data...] F7
    // Example: F0 00 20 31 64 7A 00 00 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 F7
    // Patch number is at byte 8 (0-indexed: 0x00-0x1F for patches 1-32)
    // Routing data starts at byte 10 (after the 0x00 separator)

    logInfo('Parsing potential patch response, length: ' + data.length);

    if (data.length < 20) {
        logInfo('Response too short: ' + data.length + ' bytes');
        return null;
    }
    if (data[0] !== 0xF0) return null;
    if (data[1] !== 0x00 || data[2] !== 0x20 || data[3] !== 0x31) return null;
    if (data[4] !== 0x64) {
        logInfo('Not an Emagic message');
        return null;
    }

    logInfo('Response command byte: 0x' + data[5].toString(16).padStart(2, '0'));

    if (data[5] !== 0x7A) {
        logInfo('Not a patch response (expected 0x7A)');
        return null;
    }
    if (data[6] !== 0x00 || data[7] !== 0x00) return null;
    if (data[data.length - 1] !== 0xF7) return null;

    const patchNumber = data[8] + 1; // Convert from 0-indexed to 1-indexed

    logInfo('Patch response detected for patch ' + patchNumber);

    // Routing data starts at byte 10 (index 9 is 0x00 separator)
    // Each output has 2 bytes: bytes 10-11 for output 1, 12-13 for output 2, etc.
    const routingBytes = data.slice(10, data.length - 1);

    logInfo('Routing bytes: ' + routingBytes.length + ' bytes');

    // Parse routing data based on device type
    const routing = parseRoutingData(routingBytes);

    logInfo('Parsed routing: ' + JSON.stringify(routing));

    return {
        patchNumber: patchNumber,
        routing: routing
    };
}

// Parse routing data bytes into input/output mapping
function parseRoutingData(routingBytes) {
    const routing = {};

    if (!detectedDeviceInfo) return routing;

    let numInputs, numOutputs;
    if (detectedDeviceInfo.deviceType === 'MT4') {
        numInputs = 2;
        numOutputs = 4;
    } else {
        numInputs = 8;
        numOutputs = 8;
    }

    // Each output has 2 bytes representing which inputs are routed to it
    // The 8 bits are split into 4-bit nibbles across two MIDI bytes (7-bit format)
    // First byte contains bits 4-7 (inputs 5-8)
    // Second byte contains bits 0-3 (inputs 1-4)
    //
    // Examples:
    // 00 00 = no inputs
    // 00 01 = input 1 (bit 0)
    // 00 02 = input 2 (bit 1)
    // 00 04 = input 3 (bit 2)
    // 00 08 = input 4 (bit 3)
    // 01 00 = input 5 (bit 4)
    // 02 00 = input 6 (bit 5)
    // 04 00 = input 7 (bit 6)
    // 08 00 = input 8 (bit 7)
    // 0F 0E = 0xFE = all inputs except input 1 (bits 1-7 set)

    for (let o = 0; o < numOutputs; o++) {
        const byteIndex = o * 2;
        if (byteIndex + 1 >= routingBytes.length) break;

        const highNibble = routingBytes[byteIndex];     // Bits 4-7 (inputs 5-8)
        const lowNibble = routingBytes[byteIndex + 1];  // Bits 0-3 (inputs 1-4)

        // Reconstruct the 8-bit bitmap
        const bitmap = lowNibble | (highNibble << 4);

        const outputNum = o + 1;

        logInfo('Output ' + outputNum + ': bytes [' +
            highNibble.toString(16).padStart(2, '0') + ' ' +
            lowNibble.toString(16).padStart(2, '0') + '] = bitmap 0x' +
            bitmap.toString(16).padStart(2, '0'));

        // Check each input bit
        for (let i = 0; i < numInputs; i++) {
            const inputNum = i + 1;
            const isRouted = (bitmap & (1 << i)) !== 0;

            if (!routing[inputNum]) {
                routing[inputNum] = {};
            }
            routing[inputNum][outputNum] = isRouted;
        }
    }

    return routing;
}

// Update matrix checkboxes from routing data
function updateMatrixFromPatchData(routing) {
    const checkboxes = document.querySelectorAll('.matrix-checkbox');
    checkboxes.forEach(cb => {
        const input = parseInt(cb.dataset.input);
        const output = parseInt(cb.dataset.output);
        const enabled = routing[input]?.[output] || false;
        cb.checked = enabled;
    });

    // Store in local patch data
    patchData[currentPatch] = routing;
}

// Save routing for current patch
function savePatchRouting(input, output, enabled) {
    if (!patchData[currentPatch]) {
        patchData[currentPatch] = {};
    }
    if (!patchData[currentPatch][input]) {
        patchData[currentPatch][input] = {};
    }
    patchData[currentPatch][input][output] = enabled;

    logInfo(`Patch ${currentPatch}: Input ${input} to Output ${output} = ${enabled}`);
}

// Load patch data into matrix (kept for local data loading)
function loadPatchData(patchNumber) {
    const checkboxes = document.querySelectorAll('.matrix-checkbox');
    checkboxes.forEach(cb => {
        const input = parseInt(cb.dataset.input);
        const output = parseInt(cb.dataset.output);
        const enabled = patchData[patchNumber]?.[input]?.[output] || false;
        cb.checked = enabled;
    });

    logInfo(`Loaded patch ${patchNumber} from local data`);
}

// Copy button handler
copyBtn.addEventListener('click', () => {
    const routing = {};
    const checkboxes = document.querySelectorAll('.matrix-checkbox');

    checkboxes.forEach(cb => {
        const input = parseInt(cb.dataset.input);
        const output = parseInt(cb.dataset.output);

        if (!routing[input]) routing[input] = {};
        routing[input][output] = cb.checked;
    });

    clipboardBuffer = JSON.parse(JSON.stringify(routing));
    pasteBtn.disabled = false;
    logInfo('Matrix copied to clipboard buffer');
});

// Paste button handler
pasteBtn.addEventListener('click', () => {
    if (!clipboardBuffer) return;
    updateMatrixFromPatchData(clipboardBuffer);
    patchData[currentPatch] = JSON.parse(JSON.stringify(clipboardBuffer));
    logInfo('Clipboard buffer pasted to matrix');
});

// Reset button handler
resetBtn.addEventListener('click', () => {
    const resetBytes = [0x0F, 0x0E, 0x0F, 0x0D, 0x0F, 0x0B, 0x0F, 0x07,
        0x0E, 0x0F, 0x0D, 0x0F, 0x0B, 0x0F, 0x07, 0x0F];
    const routing = parseRoutingData(resetBytes);
    updateMatrixFromPatchData(routing);
    patchData[currentPatch] = routing;
    logInfo('Matrix reset to default routing (all except same input)');
});

// Build routing bytes from patch routing data (inverse of parseRoutingData)
function buildRoutingBytes(patchNumber) {
    if (!detectedDeviceInfo) return null;

    let numInputs, numOutputs;
    if (detectedDeviceInfo.deviceType === 'MT4') {
        numInputs = 2;
        numOutputs = 4;
    } else {
        numInputs = 8;
        numOutputs = 8;
    }

    const routing = patchData[patchNumber] || {};
    const routingBytes = [];

    for (let o = 1; o <= numOutputs; o++) {
        let bitmap = 0;
        for (let i = 0; i < numInputs; i++) {
            const inputNum = i + 1;
            if (routing[inputNum] && routing[inputNum][o]) {
                bitmap |= (1 << i);
            }
        }
        // Split into two 4-bit nibbles across two MIDI bytes (same format as received)
        const highNibble = (bitmap >> 4) & 0x0F;  // bits 4-7 (inputs 5-8)
        const lowNibble = bitmap & 0x0F;  // bits 0-3 (inputs 1-4)
        routingBytes.push(highNibble, lowNibble);
    }

    return routingBytes;
}

// Send current patch routing to the device
// SysEx: F0 00 20 31 64 11 00 00 [patch-1] 00 [routingBytes...] F7
async function sendPatchToDevice(patchNumber) {
    if (!selectedOutputPort || !selectedInputPort) {
        logInfo('Cannot send patch - no MIDI ports selected');
        return;
    }

    const routingBytes = buildRoutingBytes(patchNumber);
    if (!routingBytes) {
        logInfo('Cannot send patch - no device info');
        return;
    }

    const msg = [0xF0, 0x00, 0x20, 0x31, 0x64, 0x11, 0x00, 0x00,
        patchNumber - 1, 0x00].concat(routingBytes).concat([0xF7]);

    // Make sure both ports are open before sending
    await ensurePortOpen(selectedOutputPort, 'Output');
    await ensurePortOpen(selectedInputPort, 'Input');

    logInfo('Sending patch ' + patchNumber + ' to device');
    logDebug('sent', msg);
    selectedOutputPort.send(msg);
}

// Send button handler
const sendBtn = document.getElementById('sendBtn');
sendBtn.addEventListener('click', () => {
    sendPatchToDevice(currentPatch);
});

// LED brightness (Global tab)
// SysEx: F0 00 20 31 64 13 00 00 00 [led] 00 [brightness-hi] [brightness-lo] F7
const LED_SELECT_BYTE = { io: 0x07, rs: 0x08 };

// Brightness level (0-8) as the two-byte value expected by the device
const LED_BRIGHTNESS_BYTES = [
    [0x00, 0x00], // Off
    [0x00, 0x01], // 1
    [0x00, 0x02], // 2
    [0x00, 0x04], // 3
    [0x00, 0x08], // 4
    [0x01, 0x00], // 5
    [0x02, 0x00], // 6
    [0x04, 0x00], // 7
    [0x08, 0x00]  // 8
];

async function sendLedBrightness(ledType, level) {
    if (!selectedOutputPort) {
        logInfo('Cannot send LED brightness - no MIDI output selected');
        return;
    }

    const [brightnessHi, brightnessLo] = LED_BRIGHTNESS_BYTES[level];
    const msg = [0xF0, 0x00, 0x20, 0x31, 0x64, 0x13, 0x00, 0x00, 0x00,
        LED_SELECT_BYTE[ledType], 0x00, brightnessHi, brightnessLo, 0xF7];

    // Make sure the output port is open before sending
    await ensurePortOpen(selectedOutputPort, 'Output');

    logInfo(`Setting ${ledType === 'io' ? 'I/O' : 'RS'} LED brightness to ${level === 0 ? 'Off' : level}`);
    logDebug('sent', msg);
    selectedOutputPort.send(msg);
}

function bindBrightnessSlider(sliderId, valueId, ledType) {
    const slider = document.getElementById(sliderId);
    const valueLabel = document.getElementById(valueId);

    slider.addEventListener('input', () => {
        valueLabel.textContent = slider.value === '0' ? 'Off' : slider.value;
    });

    slider.addEventListener('change', () => {
        sendLedBrightness(ledType, parseInt(slider.value, 10));
    });
}

bindBrightnessSlider('ioLedBrightness', 'ioLedBrightnessValue', 'io');
bindBrightnessSlider('rsLedBrightness', 'rsLedBrightnessValue', 'rs');

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(targetTab + 'Tab').classList.add('active');
    });
});

// Initialize on page load
initMIDI();
