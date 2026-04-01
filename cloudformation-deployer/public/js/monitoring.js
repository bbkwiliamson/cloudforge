// Stack Monitoring Module
function openStackMonitoringDialog(stackName, region, accessKeyId, secretAccessKey, deploymentMode) {
    // Create monitoring popup if it doesn't exist
    if (!document.getElementById('stackMonitoringPopup')) {
        const popupHTML = `
            <div class="popup-overlay" id="stackMonitoringPopup">
                <div class="popup" style="min-width: 500px; max-width: 700px;">
                    <button type="button" onclick="closeStackMonitoring()" class="close-btn">&times;</button>
                    <h3 id="monitoringTitle">Stack Deployment Monitoring</h3>
                    <div id="monitoringContent" style="max-height: 400px; overflow-y: auto; padding: 15px; background: #f8f9fa; border-radius: 5px; margin: 15px 0;">
                        <p style="color: #007cba;">🔍 Initializing stack monitoring...</p>
                    </div>
                    <div style="text-align: center; margin-top: 15px;">
                        <button id="closeMonitoringBtn" onclick="closeStackMonitoring()" class="cancel-btn" style="display: none;">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', popupHTML);
    }
    
    // Show the popup
    document.getElementById('stackMonitoringPopup').style.display = 'block';
    
    if (deploymentMode === 'rollback') {
        document.getElementById('monitoringTitle').textContent = 'Stack Rollback Required';
    } else if (deploymentMode === 'delete') {
        document.getElementById('monitoringTitle').textContent = 'Stack Deletion Monitoring';
    } else {
        document.getElementById('monitoringTitle').textContent = `Stack ${deploymentMode === 'update' ? 'Update' : 'Deployment'} Monitoring`;
    }
    
    // Start monitoring
    monitorStackStatusInDialog(stackName, region, accessKeyId, secretAccessKey, deploymentMode);
}

function closeStackMonitoring() {
    document.getElementById('stackMonitoringPopup').style.display = 'none';
}

async function monitorStackStatusInDialog(stackName, region, accessKeyId, secretAccessKey, deploymentMode) {
    const contentDiv = document.getElementById('monitoringContent');
    const closeBtn = document.getElementById('closeMonitoringBtn');
    let pollCount = 0;
    
    const addLogEntry = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        const colors = {
            info: '#007cba',
            success: '#28a745',
            error: '#dc3545',
            warning: '#fd7e14'
        };
        
        const logEntry = document.createElement('div');
        logEntry.style.cssText = `margin: 5px 0; padding: 8px; border-left: 3px solid ${colors[type]}; background: white; border-radius: 3px;`;
        logEntry.innerHTML = `<span style="color: #666; font-size: 12px;">[${timestamp}]</span> <span style="color: ${colors[type]};">${message}</span>`;
        
        contentDiv.appendChild(logEntry);
        contentDiv.scrollTop = contentDiv.scrollHeight;
    };
    
    // Handle rollback mode - immediately show rollback options
    if (deploymentMode === 'rollback') {
        addLogEntry('⚠️ Stack is in UPDATE_ROLLBACK_FAILED state and cannot be updated.', 'error');
        addLogEntry('You need to complete the rollback before attempting another update.', 'warning');
        
        // Add rollback buttons immediately
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'margin: 10px 0; text-align: center;';
        
        const rollbackBtn = document.createElement('button');
        rollbackBtn.textContent = 'Continue Update Rollback';
        rollbackBtn.style.cssText = 'background: #fd7e14; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;';
        rollbackBtn.onclick = () => continueUpdateRollback(stackName, region, accessKeyId, secretAccessKey, false);
        
        const rollbackSkipBtn = document.createElement('button');
        rollbackSkipBtn.textContent = 'Continue Rollback (Skip Resources)';
        rollbackSkipBtn.style.cssText = 'background: #dc3545; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;';
        rollbackSkipBtn.onclick = () => continueUpdateRollback(stackName, region, accessKeyId, secretAccessKey, true);
        
        buttonContainer.appendChild(rollbackBtn);
        buttonContainer.appendChild(rollbackSkipBtn);
        contentDiv.appendChild(buttonContainer);
        
        closeBtn.style.display = 'inline-block';
        closeBtn.textContent = 'Close';
        return; // Don't start normal monitoring
    }
    
    addLogEntry(`Starting monitoring for stack: ${stackName}`);
    
    const pollStatus = async () => {
        try {
            pollCount++;
            addLogEntry(`Checking stack status... (Check #${pollCount})`);
            
            const response = await fetch('/check-stack-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stackName,
                    region,
                    accessKeyId,
                    secretAccessKey
                })
            });
            
            const data = await response.json();
            if (response.ok) {
                if (data.isFailed) {
                    // Stack failed
                    const operationType = deploymentMode === 'delete' ? 'deletion' : deploymentMode === 'update' ? 'update' : 'deployment';
                    addLogEntry(`❌ Stack ${operationType} FAILED!`, 'error');
                    addLogEntry(`Status: ${data.status}`, 'error');
                    
                    if (data.statusReason) {
                        addLogEntry(`Reason: ${data.statusReason}`, 'error');
                    }
                    
                    // Display detailed failed events if available
                    if (data.failedEvents && Array.isArray(data.failedEvents) && data.failedEvents.length > 0) {
                        addLogEntry('', 'info'); // Spacer
                        addLogEntry('📋 Detailed Error Information:', 'error');
                        data.failedEvents.forEach((event, index) => {
                            addLogEntry(`${index + 1}. ${event.resourceType} - ${event.logicalResourceId}`, 'error');
                            addLogEntry(`   Status: ${event.resourceStatus}`, 'error');
                            if (event.resourceStatusReason && event.resourceStatusReason !== 'N/A') {
                                addLogEntry(`   Reason: ${event.resourceStatusReason}`, 'error');
                            }
                            if (index < data.failedEvents.length - 1) {
                                addLogEntry('', 'info'); // Spacer between events
                            }
                        });
                    } else {
                        addLogEntry('Please check AWS CloudFormation console for detailed error information.', 'error');
                    }
                    
                    // Check if stack is in UPDATE_ROLLBACK_FAILED state
                    if (data.status === 'UPDATE_ROLLBACK_FAILED') {
                        addLogEntry('⚠️ Stack is in UPDATE_ROLLBACK_FAILED state. You can try to continue the rollback.', 'warning');
                        
                        // Add rollback buttons
                        const buttonContainer = document.createElement('div');
                        buttonContainer.style.cssText = 'margin: 10px 0; text-align: center;';
                        
                        const rollbackBtn = document.createElement('button');
                        rollbackBtn.textContent = 'Continue Update Rollback';
                        rollbackBtn.style.cssText = 'background: #fd7e14; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;';
                        rollbackBtn.onclick = () => continueUpdateRollback(stackName, region, accessKeyId, secretAccessKey, false);
                        
                        const rollbackSkipBtn = document.createElement('button');
                        rollbackSkipBtn.textContent = 'Continue Rollback (Skip Resources)';
                        rollbackSkipBtn.style.cssText = 'background: #dc3545; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;';
                        rollbackSkipBtn.onclick = () => continueUpdateRollback(stackName, region, accessKeyId, secretAccessKey, true);
                        
                        buttonContainer.appendChild(rollbackBtn);
                        buttonContainer.appendChild(rollbackSkipBtn);
                        contentDiv.appendChild(buttonContainer);
                    }
                    
                    closeBtn.style.display = 'inline-block';
                    closeBtn.textContent = 'Close (Error Details Above)';
                    
                    // Auto-close after 2 minutes unless user interacts
                    setTimeout(() => {
                        if (document.getElementById('stackMonitoringPopup').style.display === 'block') {
                            closeStackMonitoring();
                        }
                    }, 120000);
                    
                    return; // Stop polling
                } else if (data.isComplete && !data.isFailed) {
                    // Stack completed successfully
                    const operationType = deploymentMode === 'delete' ? 'deletion' : deploymentMode === 'update' ? 'update' : 'deployment';
                    addLogEntry(`✅ Stack ${operationType} completed successfully!`, 'success');
                    addLogEntry(`Final Status: ${data.status}`, 'success');
                    addLogEntry(`Total monitoring time: ${Math.round(pollCount * 10 / 60)} minutes`, 'info');
                    
                    closeBtn.style.display = 'inline-block';
                    closeBtn.textContent = 'Close (Success!)';
                    
                    // Auto-close after 30 seconds
                    setTimeout(() => {
                        if (document.getElementById('stackMonitoringPopup').style.display === 'block') {
                            closeStackMonitoring();
                        }
                    }, 30000);
                    
                    return; // Stop polling
                } else if (data.isInProgress) {
                    // Still in progress
                    addLogEntry(`Status: ${data.status} - Still in progress...`, 'info');
                    
                    // Continue polling every 10 seconds indefinitely
                    setTimeout(pollStatus, 10000);
                } else {
                    // Unknown state
                    addLogEntry(`Status: ${data.status}`, 'warning');
                    setTimeout(pollStatus, 10000);
                }
            } else {
                // Handle error responses
                const errorMessage = data.error || 'Unknown error';
                
                // For delete operations, "Stack does not exist" means successful deletion
                if (deploymentMode === 'delete' && errorMessage.includes('does not exist')) {
                    addLogEntry('✅ Stack deletion completed successfully!', 'success');
                    addLogEntry('Stack no longer exists in AWS', 'success');
                    addLogEntry(`Total monitoring time: ${Math.round(pollCount * 10 / 60)} minutes`, 'info');
                    
                    closeBtn.style.display = 'inline-block';
                    closeBtn.textContent = 'Close (Success!)';
                    
                    // Auto-close after 30 seconds
                    setTimeout(() => {
                        if (document.getElementById('stackMonitoringPopup').style.display === 'block') {
                            closeStackMonitoring();
                        }
                    }, 30000);
                    
                    return; // Stop polling
                }
                
                addLogEntry(`Error checking stack status: ${errorMessage}`, 'error');
                setTimeout(pollStatus, 15000); // Retry after 15 seconds on error
            }
        } catch (error) {
            addLogEntry(`Network error: ${error.message}`, 'error');
            setTimeout(pollStatus, 15000); // Retry after 15 seconds on error
        }
    };
    
    // Start polling after initial delay
    // For delete operations, use shorter delay since deletion is usually faster
    const initialDelay = deploymentMode === 'delete' ? 5000 : 30000;
    setTimeout(() => {
        addLogEntry('Starting status checks...');
        pollStatus();
    }, initialDelay);
}

// Rollback functions
async function continueUpdateRollback(stackName, region, accessKeyId, secretAccessKey, skipResources) {
    const contentDiv = document.getElementById('monitoringContent');
    const addLogEntry = (message, type = 'info') => {
        const logDiv = document.createElement('div');
        logDiv.style.cssText = `margin: 5px 0; padding: 8px; border-radius: 4px; background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : type === 'warning' ? '#fff3cd' : '#d1ecf1'};`;
        logDiv.textContent = message;
        contentDiv.appendChild(logDiv);
        contentDiv.scrollTop = contentDiv.scrollHeight;
    };
    
    try {
        const userInfo = localStorage.getItem('userInfo');
        let userData = null;
        if (userInfo) {
            try {
                userData = JSON.parse(userInfo).data;
            } catch (e) {}
        }
        
        // If skipResources is true, first get the failed resources and show selection
        if (skipResources) {
            // Remove any existing selection UI first
            const existingSelection = contentDiv.querySelector('div[style*="background: #fff3cd"]');
            if (existingSelection) existingSelection.remove();
            
            try {
                addLogEntry('🔍 Fetching failed resources...', 'info');
                const resourcesResponse = await fetch('/get-failed-resources', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stackName, region, accessKeyId, secretAccessKey })
                });
                
                const resourcesData = await resourcesResponse.json();
                if (resourcesResponse.ok && resourcesData.failedResources && resourcesData.failedResources.length > 0) {
                    // Show resource selection UI
                    const selectionDiv = document.createElement('div');
                    selectionDiv.id = 'resourceSelectionUI';
                    selectionDiv.style.cssText = 'margin: 15px 0; padding: 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px;';
                    selectionDiv.innerHTML = '<h4 style="margin-top: 0;">Select resources to skip during rollback:</h4>';
                    
                    resourcesData.failedResources.forEach(resource => {
                        const checkboxDiv = document.createElement('div');
                        checkboxDiv.style.cssText = 'margin: 8px 0;';
                        checkboxDiv.innerHTML = `
                            <label style="display: flex; align-items: start; cursor: pointer;">
                                <input type="checkbox" value="${resource.logicalId}" style="margin-right: 8px; margin-top: 3px;">
                                <div>
                                    <strong>${resource.logicalId}</strong> (${resource.type})<br>
                                    <small style="color: #666;">Status: ${resource.status}</small><br>
                                    ${resource.statusReason ? `<small style="color: #dc3545;">${resource.statusReason}</small>` : ''}
                                </div>
                            </label>
                        `;
                        selectionDiv.appendChild(checkboxDiv);
                    });
                    
                    const buttonDiv = document.createElement('div');
                    buttonDiv.style.cssText = 'margin-top: 15px;';
                    buttonDiv.innerHTML = `
                        <button onclick="proceedWithSelectedResources()" style="background: #ffc107; color: #000; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">Continue with Selected</button>
                        <button onclick="cancelResourceSelection()" style="background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                    `;
                    selectionDiv.appendChild(buttonDiv);
                    
                    contentDiv.appendChild(selectionDiv);
                    
                    // Store context for later use
                    window.rollbackContext = { stackName, region, accessKeyId, secretAccessKey, userData, addLogEntry, contentDiv };
                    return;
                } else {
                    addLogEntry('⚠️ No failed resources found. Proceeding without skipping.', 'warning');
                    skipResources = false;
                }
            } catch (error) {
                addLogEntry(`⚠️ Could not fetch failed resources: ${error.message}. Proceeding without skipping.`, 'warning');
                skipResources = false;
            }
        }
        
        addLogEntry(`🔄 Initiating continue update rollback...`, 'warning');
        
        const response = await fetch('/continue-update-rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stackName,
                region,
                accessKeyId,
                secretAccessKey,
                skipResources: [],
                userEmail: userData?.email || 'unknown',
                accountId: document.getElementById('accountId').value
            })
        });
        
        const result = await response.json();
        if (response.ok) {
            addLogEntry('✅ Continue update rollback initiated successfully!', 'success');
            addLogEntry('Monitoring rollback progress until UPDATE_ROLLBACK_COMPLETE...', 'info');
            
            // Remove rollback buttons
            const buttons = contentDiv.querySelectorAll('button');
            buttons.forEach(btn => btn.parentElement.remove());
            
            // Start monitoring rollback progress
            monitorRollbackProgress(stackName, region, accessKeyId, secretAccessKey, addLogEntry);
        } else {
            addLogEntry(`❌ Continue update rollback failed: ${result.error}`, 'error');
            // Buttons remain visible for retry
        }
    } catch (error) {
        addLogEntry(`❌ Error: ${error.message}`, 'error');
    }
}

async function monitorRollbackProgress(stackName, region, accessKeyId, secretAccessKey, addLogEntry) {
    const pollRollbackStatus = async () => {
        try {
            const response = await fetch('/check-stack-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stackName,
                    region,
                    accessKeyId,
                    secretAccessKey
                })
            });
            
            const data = await response.json();
            if (response.ok) {
                if (data.status === 'UPDATE_ROLLBACK_COMPLETE') {
                    addLogEntry('✅ Stack rollback completed successfully!', 'success');
                    addLogEntry('You can now attempt to update the stack again.', 'info');
                    
                    // Add retry button
                    const retryContainer = document.createElement('div');
                    retryContainer.style.cssText = 'margin: 15px 0; padding: 15px; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 5px; text-align: center;';
                    retryContainer.innerHTML = `
                        <p style="margin: 0 0 10px 0;"><strong>Rollback Complete!</strong></p>
                        <button onclick="retryFailedUpdate('${stackName}', '${region}', '${accessKeyId}', '${secretAccessKey}')" style="background: #007cba; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer;">Retry Update</button>
                    `;
                    document.getElementById('monitoringContent').appendChild(retryContainer);
                    
                    return; // Stop polling
                } else if (data.status.includes('ROLLBACK') && data.status.includes('PROGRESS')) {
                    addLogEntry(`Rollback in progress: ${data.status}`, 'info');
                    setTimeout(pollRollbackStatus, 10000);
                } else if (data.status === 'UPDATE_ROLLBACK_FAILED') {
                    addLogEntry(`❌ Rollback failed again: ${data.status}`, 'error');
                    if (data.statusReason) {
                        addLogEntry(`Reason: ${data.statusReason}`, 'error');
                    }
                    addLogEntry('⚠️ You can try again or skip specific resources.', 'warning');
                    
                    // Re-add rollback buttons to allow retry
                    const buttonContainer = document.createElement('div');
                    buttonContainer.style.cssText = 'margin: 10px 0; text-align: center;';
                    
                    const rollbackBtn = document.createElement('button');
                    rollbackBtn.textContent = 'Continue Update Rollback';
                    rollbackBtn.style.cssText = 'background: #fd7e14; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;';
                    rollbackBtn.onclick = () => continueUpdateRollback(stackName, region, accessKeyId, secretAccessKey, false);
                    
                    const rollbackSkipBtn = document.createElement('button');
                    rollbackSkipBtn.textContent = 'Continue Rollback (Skip Resources)';
                    rollbackSkipBtn.style.cssText = 'background: #dc3545; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;';
                    rollbackSkipBtn.onclick = () => continueUpdateRollback(stackName, region, accessKeyId, secretAccessKey, true);
                    
                    buttonContainer.appendChild(rollbackBtn);
                    buttonContainer.appendChild(rollbackSkipBtn);
                    
                    const contentDiv = document.getElementById('monitoringContent');
                    contentDiv.appendChild(buttonContainer);
                    
                    return; // Stop polling
                } else {
                    addLogEntry(`Status: ${data.status}`, 'info');
                    setTimeout(pollRollbackStatus, 10000);
                }
            } else {
                addLogEntry(`Error checking rollback status: ${data.error}`, 'error');
                setTimeout(pollRollbackStatus, 15000);
            }
        } catch (error) {
            addLogEntry(`Network error during rollback monitoring: ${error.message}`, 'error');
            setTimeout(pollRollbackStatus, 15000);
        }
    };
    
    // Start monitoring immediately
    pollRollbackStatus();
}

async function proceedWithSelectedResources() {
    const { stackName, region, accessKeyId, secretAccessKey, userData, addLogEntry, contentDiv } = window.rollbackContext;
    const selectionUI = document.getElementById('resourceSelectionUI');
    const checkboxes = selectionUI ? selectionUI.querySelectorAll('input[type="checkbox"]:checked') : [];
    const selectedResources = Array.from(checkboxes).map(cb => cb.value);
    
    // Remove duplicates just in case
    const uniqueResources = [...new Set(selectedResources)];
    
    // Remove selection UI
    if (selectionUI) selectionUI.remove();
    
    addLogEntry(`🔄 Initiating continue update rollback (skipping ${uniqueResources.length} resources)...`, 'warning');
    
    try {
        const response = await fetch('/continue-update-rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stackName,
                region,
                accessKeyId,
                secretAccessKey,
                skipResources: uniqueResources,
                userEmail: userData?.email || 'unknown',
                accountId: document.getElementById('accountId').value
            })
        });
        
        const result = await response.json();
        if (response.ok) {
            addLogEntry('✅ Continue update rollback initiated successfully!', 'success');
            addLogEntry('Monitoring rollback progress until UPDATE_ROLLBACK_COMPLETE...', 'info');
            
            // Remove rollback buttons
            const buttons = contentDiv.querySelectorAll('button');
            buttons.forEach(btn => btn.parentElement.remove());
            
            // Start monitoring rollback progress
            monitorRollbackProgress(stackName, region, accessKeyId, secretAccessKey, addLogEntry);
        } else {
            addLogEntry(`❌ Continue update rollback failed: ${result.error}`, 'error');
            // Buttons remain visible for retry
        }
    } catch (error) {
        addLogEntry(`❌ Error: ${error.message}`, 'error');
    }
}

function cancelResourceSelection() {
    const { stackName, region, accessKeyId, secretAccessKey, contentDiv, addLogEntry } = window.rollbackContext;
    
    // Remove selection UI
    const selectionUI = document.getElementById('resourceSelectionUI');
    if (selectionUI) selectionUI.remove();
    
    addLogEntry('Resource selection cancelled.', 'info');
    
    // Re-add rollback buttons so user can try again
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'margin: 10px 0; text-align: center;';
    
    const rollbackBtn = document.createElement('button');
    rollbackBtn.textContent = 'Continue Update Rollback';
    rollbackBtn.style.cssText = 'background: #fd7e14; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;';
    rollbackBtn.onclick = () => continueUpdateRollback(stackName, region, accessKeyId, secretAccessKey, false);
    
    const rollbackSkipBtn = document.createElement('button');
    rollbackSkipBtn.textContent = 'Continue Rollback (Skip Resources)';
    rollbackSkipBtn.style.cssText = 'background: #dc3545; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;';
    rollbackSkipBtn.onclick = () => continueUpdateRollback(stackName, region, accessKeyId, secretAccessKey, true);
    
    buttonContainer.appendChild(rollbackBtn);
    buttonContainer.appendChild(rollbackSkipBtn);
    contentDiv.appendChild(buttonContainer);
}

async function retryFailedUpdate(stackName, region, accessKeyId, secretAccessKey) {
    const contentDiv = document.querySelector('#monitoringContent');
    const addLogEntry = (message, type = 'info') => {
        const logDiv = document.createElement('div');
        logDiv.style.cssText = `margin: 5px 0; padding: 8px; border-radius: 4px; background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : type === 'warning' ? '#fff3cd' : '#d1ecf1'};`;
        logDiv.textContent = message;
        contentDiv.appendChild(logDiv);
        contentDiv.scrollTop = contentDiv.scrollHeight;
    };
    
    // Remove retry buttons
    const retryContainer = contentDiv.querySelector('div[style*="background: #d1ecf1"]');
    if (retryContainer) retryContainer.remove();
    
    addLogEntry('🔄 Preparing to retry the update...', 'info');
    addLogEntry('⚠️ Please ensure you have fixed the issue that caused the previous failure.', 'warning');
    
    // Close monitoring popup
    closeStackMonitoring();
    
    // Switch to update mode and pre-fill stack name
    document.getElementById('deploymentMode').value = 'update';
    document.getElementById('deploymentMode').dispatchEvent(new Event('change'));
    
    // Pre-fill the stack name
    setTimeout(() => {
        document.getElementById('stackSearchName').value = stackName;
        showAlert('Stack name pre-filled. Please select your template and click "Upload Stack" to retry the update.', 'success');
    }, 500);
}

// Stack status monitoring function (backward compatibility)
async function monitorStackStatus(stackName, region, accessKeyId, secretAccessKey, deploymentMode) {
    // This function is now replaced by the dialog version above
    // Keeping for backward compatibility but redirecting to dialog
    openStackMonitoringDialog(stackName, region, accessKeyId, secretAccessKey, deploymentMode);
}