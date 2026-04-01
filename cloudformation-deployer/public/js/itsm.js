// ITSM Integration Functions
let generatedDocumentData = null;
let isManualCrqUpdate = false;

function showItsmUpdatesWindow(crqId) {
    document.getElementById('itsmCrqId').value = crqId;
    document.getElementById('closeCrqId').value = crqId;
    document.getElementById('itsmCrqId').readOnly = true;
    document.getElementById('itsmCrqId').style.background = '#f5f5f5';
    document.getElementById('itsmUpdatesWindow').style.display = 'block';
    generatedDocumentData = null;
    isManualCrqUpdate = false;
}

function openItsmUpdateManually() {
    document.getElementById('itsmCrqId').value = '';
    document.getElementById('closeCrqId').value = '';
    document.getElementById('itsmCrqId').readOnly = false;
    document.getElementById('itsmCrqId').style.background = 'white';
    document.getElementById('itsmCrqId').placeholder = 'Enter CRQ ID (e.g., CRQ000000682238)';
    document.getElementById('itsmUpdatesWindow').style.display = 'block';
    generatedDocumentData = null;
    isManualCrqUpdate = true;
    closeITSMQuery();
}

function closeItsmUpdates() {
    document.getElementById('itsmUpdatesWindow').style.display = 'none';
    generatedDocumentData = null;
    isManualCrqUpdate = false;
    // Reset CRQ ID field to readonly state
    document.getElementById('itsmCrqId').readOnly = true;
    document.getElementById('itsmCrqId').style.background = '#f5f5f5';
    document.getElementById('itsmCrqId').placeholder = '';
}

function storeDeploymentContext(stackName, accountId, environment) {
    const context = {
        stackName: stackName,
        accountId: accountId,
        environment: environment,
        timestamp: Date.now()
    };
    sessionStorage.setItem('deploymentContext', JSON.stringify(context));
    startContextTimer();
}

function getDeploymentContext() {
    try {
        const stored = sessionStorage.getItem('deploymentContext');
        if (!stored) return null;
        const context = JSON.parse(stored);
        if (Date.now() - context.timestamp > 2 * 60 * 60 * 1000) {
            sessionStorage.removeItem('deploymentContext');
            updateTimerDisplay(0);
            return null;
        }
        return context;
    } catch (e) {
        return null;
    }
}

function clearDeploymentContext() {
    sessionStorage.removeItem('deploymentContext');
    if (window._contextTimerInterval) clearInterval(window._contextTimerInterval);
    updateTimerDisplay(0);
}

function updateTimerDisplay(remaining) {
    const el = document.getElementById('contextTimer');
    if (!el) return;
    if (remaining <= 0) {
        el.textContent = '';
        return;
    }
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function startContextTimer() {
    if (window._contextTimerInterval) clearInterval(window._contextTimerInterval);
    window._contextTimerInterval = setInterval(() => {
        const stored = sessionStorage.getItem('deploymentContext');
        if (!stored) {
            updateTimerDisplay(0);
            clearInterval(window._contextTimerInterval);
            return;
        }
        try {
            const context = JSON.parse(stored);
            const remaining = (2 * 60 * 60 * 1000) - (Date.now() - context.timestamp);
            if (remaining <= 0) {
                sessionStorage.removeItem('deploymentContext');
                updateTimerDisplay(0);
                clearInterval(window._contextTimerInterval);
                showAlert('Deployment context expired', 'warning');
            } else {
                updateTimerDisplay(remaining);
            }
        } catch (e) {
            updateTimerDisplay(0);
            clearInterval(window._contextTimerInterval);
        }
    }, 1000);
}

// Resume timer on page load if context exists
(function() {
    const stored = sessionStorage.getItem('deploymentContext');
    if (stored) startContextTimer();
})();

const WORK_INFO_TYPE_MAP = {
    '23000': { docName: 'postreview.docx', heading: 'Post Implementation Review' },
    '11000': { docName: 'backout.docx', heading: 'Backout Plan Review' },
    '22000': { docName: 'cancelled.docx', heading: 'Cancellation Review' },
    '20000': { docName: 'testresults.docx', heading: 'Test Results Review' },
    '16000': { docName: 'testplan.docx', heading: 'Test Plan' },
    '14000': { docName: 'installplan.docx', heading: 'Install Plan' }
};

async function generateImplementationPlan() {
    const crqPlan = document.getElementById('itsmCrqPlan').value;
    const workInfoType = document.getElementById('itsmWorkInfoType').value;
    const tcrFiles = document.getElementById('itsmTcrScreendump').files;
    
    if (!crqPlan) {
        showAlert('Please select a CRQ Plan first', 'warning');
        document.getElementById('itsmTcrScreendump').value = '';
        return;
    }
    
    if (!workInfoType) {
        showAlert('Please select a Work Info Type first', 'warning');
        document.getElementById('itsmTcrScreendump').value = '';
        return;
    }
    
    // For Test Plan (16000), auto-generate without requiring TCR files
    if (workInfoType === '16000') {
        await generateTestPlanDocument(crqPlan, workInfoType);
        return;
    }
    
    if (!tcrFiles || tcrFiles.length === 0) {
        return;
    }
    
    const docConfig = WORK_INFO_TYPE_MAP[workInfoType] || { docName: 'implementPlan.docx', heading: 'Implementation Plan' };
    
    console.log('Starting document generation...');
    console.log('CRQ Plan:', crqPlan);
    console.log('Work Info Type:', workInfoType, 'Doc:', docConfig.docName);
    console.log('TCR Files:', tcrFiles.length);
    
    try {
        const images = [];
        for (const file of tcrFiles) {
            const data = await fileToBase64(file);
            images.push({ data: data, name: file.name });
        }
        
        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        const savedContext = getDeploymentContext();
        const stackName = document.getElementById('stackName')?.value || document.getElementById('deleteStackName')?.value || savedContext?.stackName || 'N/A';
        const accountId = document.getElementById('accountId')?.value || savedContext?.accountId || 'N/A';
        const region = document.getElementById('region')?.value || 'af-south-1';
        const environment = document.getElementById('deployEnvironment')?.value || savedContext?.environment || 'PROD';
        
        // Store context for later use
        if (stackName !== 'N/A') {
            storeDeploymentContext(stackName, accountId, environment);
        }
        
        console.log('Stack Name:', stackName);
        console.log('Account ID:', accountId);
        console.log('Developer:', userInfo?.data?.email);
        
        const payload = {
            crqPlan: crqPlan,
            environment: environment,
            accountId: accountId,
            stackName: stackName,
            developer: userInfo?.data?.email || 'N/A',
            images: images,
            docName: docConfig.docName,
            docHeading: docConfig.heading,
            workInfoType: workInfoType
        };
        
        showAlert('Generating implementation plan...', 'info');
        
        const response = await fetch('/generate-implementation-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        console.log('Backend response:', result);
        
        if (response.ok && result.documentData) {
            generatedDocumentData = result.documentData;
            console.log('Document data stored, length:', generatedDocumentData.length);
            document.getElementById('itsmAttachmentName').value = docConfig.docName;
            document.getElementById('itsmAttachmentStatus').value = '✓ Document ready (' + (result.documentData.length / 1024).toFixed(1) + ' KB)';
            document.getElementById('itsmAttachmentStatus').style.color = '#155724';
            document.getElementById('itsmAttachmentStatus').style.backgroundColor = '#d4edda';
            showAlert('Implementation plan generated successfully!', 'success');
        } else {
            throw new Error(result.error || 'Failed to generate document');
        }
    } catch (error) {
        console.error('Document generation error:', error);
        showAlert('Error generating implementation plan: ' + error.message, 'error');
        document.getElementById('itsmTcrScreendump').value = '';
    }
}

async function generateTestPlanDocument(crqPlan, workInfoType) {
    try {
        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        const savedContext = getDeploymentContext();
        const stackName = document.getElementById('stackName')?.value || document.getElementById('deleteStackName')?.value || savedContext?.stackName || 'N/A';
        const accountId = document.getElementById('accountId')?.value || savedContext?.accountId || 'N/A';
        const region = document.getElementById('region')?.value || 'af-south-1';
        const environment = document.getElementById('deployEnvironment')?.value || savedContext?.environment || 'PROD';
        
        // Store context for later use
        if (stackName !== 'N/A') {
            storeDeploymentContext(stackName, accountId, environment);
        }
        
        console.log('Generating Test Plan document automatically');
        console.log('Stack Name:', stackName);
        console.log('Account ID:', accountId);
        console.log('Developer:', userInfo?.data?.email);
        
        // Create a virtual AWS logo image to simulate TCR attachment
        const awsLogoData = await createVirtualAwsLogo();
        const images = [{ data: awsLogoData, name: 'aws_infrastructure_notice.png' }];
        
        const payload = {
            crqPlan: crqPlan,
            environment: environment,
            accountId: accountId,
            stackName: stackName,
            developer: userInfo?.data?.email || 'N/A',
            images: images, // Include the auto-generated image
            docName: 'testplan.docx',
            docHeading: 'Test Plan',
            workInfoType: workInfoType,
            autoGenerate: true // Flag to indicate auto-generation
        };
        
        showAlert('Generating test plan document...', 'info');
        
        const response = await fetch('/generate-implementation-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        console.log('Backend response:', result);
        
        if (response.ok && result.documentData) {
            generatedDocumentData = result.documentData;
            console.log('Test plan document data stored, length:', generatedDocumentData.length);
            document.getElementById('itsmAttachmentName').value = 'testplan.docx';
            document.getElementById('itsmAttachmentStatus').value = '✓ Test plan document ready (' + (result.documentData.length / 1024).toFixed(1) + ' KB)';
            document.getElementById('itsmAttachmentStatus').style.color = '#155724';
            document.getElementById('itsmAttachmentStatus').style.backgroundColor = '#d4edda';
            
            // Update TCR field to show that image was auto-generated
            const tcrField = document.getElementById('itsmTcrScreendump');
            tcrField.style.backgroundColor = '#d4edda';
            tcrField.style.borderColor = '#28a745';
            
            // Add a visual indicator that the attachment was auto-generated
            let indicator = document.getElementById('autoGeneratedIndicator');
            if (!indicator) {
                indicator = document.createElement('small');
                indicator.id = 'autoGeneratedIndicator';
                indicator.style.color = '#155724';
                indicator.style.display = 'block';
                indicator.style.marginTop = '5px';
                tcrField.parentNode.appendChild(indicator);
            }
            indicator.textContent = '✓ AWS logo image auto-generated for test plan';
            
            showAlert('Test plan document generated successfully!', 'success');
        } else {
            throw new Error(result.error || 'Failed to generate test plan document');
        }
    } catch (error) {
        console.error('Test plan document generation error:', error);
        showAlert('Error generating test plan document: ' + error.message, 'error');
    }
}

async function createVirtualAwsLogo() {
    // Create a simple base64 encoded image data for the AWS logo
    // This is a minimal PNG image that will be enhanced by the backend
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        
        // White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 800, 400);
        
        // AWS orange border
        ctx.strokeStyle = '#FF9900';
        ctx.lineWidth = 3;
        ctx.strokeRect(50, 50, 700, 300);
        
        // AWS text
        ctx.fillStyle = '#FF9900';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('AWS', 400, 150);
        
        // Main text
        ctx.fillStyle = '#232F3E';
        ctx.font = '24px Arial';
        ctx.fillText('Infrastructure As Code Change:', 400, 220);
        ctx.fillText('No test plan available', 400, 260);
        
        // Convert canvas to base64
        const dataURL = canvas.toDataURL('image/png');
        const base64Data = dataURL.split(',')[1]; // Remove data:image/png;base64, prefix
        resolve(base64Data);
    });
}

function handleWorkInfoTypeChange() {
    const workInfoType = document.getElementById('itsmWorkInfoType').value;
    const crqPlan = document.getElementById('itsmCrqPlan').value;
    
    // Clear any previous auto-generated indicators
    clearAutoGeneratedIndicators();
    
    // Auto-generate for Test Plan (16000) if CRQ Plan is selected
    if (workInfoType === '16000' && crqPlan) {
        generateTestPlanDocument(crqPlan, workInfoType);
    }
}

function clearAutoGeneratedIndicators() {
    // Reset TCR field styling
    const tcrField = document.getElementById('itsmTcrScreendump');
    tcrField.style.backgroundColor = '';
    tcrField.style.borderColor = '';
    
    // Remove auto-generated indicator
    const indicator = document.getElementById('autoGeneratedIndicator');
    if (indicator) {
        indicator.remove();
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function minimizeItsmUpdates() {
    const content = document.getElementById('itsmUpdatesContent');
    if (content.style.display === 'none') {
        content.style.display = 'block';
    } else {
        content.style.display = 'none';
    }
}

// Draggable ITSM Updates window
(function() {
    let isDragging = false, offsetX = 0, offsetY = 0;
    document.addEventListener('mousedown', function(e) {
        const header = document.getElementById('itsmUpdatesHeader');
        if (header && header.contains(e.target) && e.target.tagName !== 'BUTTON') {
            isDragging = true;
            const win = document.getElementById('itsmUpdatesWindow');
            const rect = win.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            e.preventDefault();
        }
    });
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const win = document.getElementById('itsmUpdatesWindow');
        win.style.left = (e.clientX - offsetX) + 'px';
        win.style.top = (e.clientY - offsetY) + 'px';
        win.style.right = 'auto';
    });
    document.addEventListener('mouseup', function() {
        isDragging = false;
    });
})();

async function updateCrqWork() {
    const crqId = document.getElementById('itsmCrqId').value.trim();
    const workInfoType = document.getElementById('itsmWorkInfoType').value;
    const crqPlan = document.getElementById('itsmCrqPlan').value;
    
    console.log('Updating CRQ:', crqId);
    console.log('Work Info Type:', workInfoType);
    console.log('Generated Document Data exists:', !!generatedDocumentData);
    console.log('Is Manual Update:', isManualCrqUpdate);
    
    if (!crqId) {
        showAlert('Please enter a CRQ ID', 'warning');
        return;
    }
    
    if (!workInfoType) {
        showAlert('Please select a Work Info Type', 'warning');
        return;
    }
    
    if (!generatedDocumentData) {
        showAlert('Please upload a TCR Screendump to generate the implementation plan', 'warning');
        return;
    }
    
    // Update closeCrqId field with the current CRQ ID
    document.getElementById('closeCrqId').value = crqId;
    
    // Get deployment details for work notes
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    const stackName = isManualCrqUpdate ? 'Manual Update' : (document.getElementById('stackName')?.value || document.getElementById('deleteStackName')?.value || 'N/A');
    const accountId = isManualCrqUpdate ? 'N/A' : (document.getElementById('accountId').value || 'N/A');
    const workNotes = `CloudForge ${crqPlan} - Implementation plan document attached for stack: ${stackName} in account: ${accountId}. Submitted by: ${userInfo?.data?.email || 'N/A'}`;
    
    console.log('Sending CRQ update with document, size:', generatedDocumentData.length);
    console.log('Work Notes:', workNotes);
    
    try {
        const response = await fetch('/update-crq-work', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                changeId: crqId,
                workInfoType: workInfoType,
                attachmentData: generatedDocumentData,
                attachmentName: document.getElementById('itsmAttachmentName').value,
                workNotes: workNotes
            })
        });
        
        const result = await response.json();
        if (response.ok) {
            showAlert('CRQ updated successfully!', 'success');
            // Show close CRQ section and populate it
            document.getElementById('closeCrqSection').style.display = 'block';
            document.getElementById('closeCrqId').value = crqId;
            // Reset form but keep window open
            document.getElementById('itsmWorkInfoType').value = '';
            document.getElementById('itsmCrqPlan').value = '';
            document.getElementById('itsmTcrScreendump').value = '';
            document.getElementById('itsmAttachmentName').value = 'implementPlan.docx';
            document.getElementById('itsmAttachmentStatus').value = 'No document generated';
            document.getElementById('itsmAttachmentStatus').style.color = '#666';
            document.getElementById('itsmAttachmentStatus').style.backgroundColor = '#f5f5f5';
            generatedDocumentData = null;
        } else {
            showAlert('CRQ update failed: ' + result.error, 'error');
        }
    } catch (error) {
        showAlert('Error updating CRQ: ' + error.message, 'error');
    }
}

async function closeCrq() {
    const crqId = document.getElementById('closeCrqId').value;
    const statusReason = document.getElementById('crqStatusReason').value;
    
    if (!statusReason) {
        showAlert('Please select a CRQ Status Reason', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/close-crq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                changeId: crqId,
                statusReason: statusReason
            })
        });
        
        const result = await response.json();
        if (response.ok) {
            showAlert('CRQ closed successfully!', 'success');
            closeItsmUpdates();
        } else {
            showAlert('CRQ close failed: ' + result.error, 'error');
        }
    } catch (error) {
        showAlert('Error closing CRQ: ' + error.message, 'error');
    }
}

// ITSM Query Functions
function openITSM() {
    document.getElementById('itsmQueryPopup').style.display = 'block';
    document.getElementById('crqQueryNumber').value = '';
    document.getElementById('crqQueryResults').style.display = 'none';
}

function closeITSMQuery() {
    document.getElementById('itsmQueryPopup').style.display = 'none';
}

async function searchCRQ() {
    const crqNumber = document.getElementById('crqQueryNumber').value.trim();
    
    if (!crqNumber) {
        showAlert('Please enter a CRQ number', 'warning');
        return;
    }
    
    const resultsDiv = document.getElementById('crqQueryResults');
    resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="sc-spinner"></div><p>Searching CRQ...</p></div>';
    resultsDiv.style.display = 'block';
    
    try {
        const response = await fetch('/itsm/query-change', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ crqNumber })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            const data = result.data;
            resultsDiv.innerHTML = `
                <div style="background: #f8f9fa; padding: 20px; border-radius: 5px;">
                    <h4 style="margin-top: 0; color: #007cba;">CRQ Details</h4>
                    <div style="margin-bottom: 15px;">
                        <strong>Change Number:</strong>
                        <div style="padding: 8px; background: white; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;">
                            ${data.ChangeNumber || 'N/A'}
                        </div>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <strong>Status:</strong>
                        <div style="padding: 8px; background: white; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;">
                            ${data.Status || 'N/A'}
                        </div>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <strong>Summary:</strong>
                        <div style="padding: 8px; background: white; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;">
                            ${data.Summary || 'N/A'}
                        </div>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <strong>Notes:</strong>
                        <div style="padding: 8px; background: white; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px;">
                            ${data.Notes || 'N/A'}
                        </div>
                    </div>
                </div>
            `;
        } else {
            resultsDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc3545;"><strong>Error:</strong> ${result.error || 'Failed to query CRQ'}</div>`;
        }
    } catch (error) {
        resultsDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc3545;"><strong>Error:</strong> ${error.message}</div>`;
    }
}

// CRQ Creation Functions
async function createCrqForDeployment() {
    try {
        const stackName = document.getElementById('stackName').value.trim();
        const region = document.getElementById('region').value;
        const accountId = document.getElementById('accountId').value;
        const accessKeyId = document.getElementById('accessKeyId').value;
        const secretAccessKey = document.getElementById('secretAccessKey').value;
        
        // Get user info
        const userInfo = localStorage.getItem('userInfo');
        let userData = null;
        if (userInfo) {
            try {
                userData = JSON.parse(userInfo).data;
            } catch (e) {
                throw new Error('Session expired');
            }
        }
        
        if (!userData || !userData.email) {
            throw new Error('User session not found');
        }
        
        const deploymentData = {
            stack_name: stackName,
            account_id: accountId,
            region: region,
            environment: document.getElementById('deployEnvironment').value || 'PROD',
            template_path: templatePath,
            user_email: userData.email,
            rte_email: document.getElementById('deployRte').value,
            deployment_type: document.getElementById('deploymentMode').value === 'update' ? 'UPDATE' : 'CREATE'
        };
        
        const response = await fetch('/create-crq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deploymentData,
                accessKeyId: atob(accessKeyId),
                secretAccessKey: atob(secretAccessKey)
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.changeId) {
            // CRQ created successfully
            const crqInput = document.getElementById('deployCrqId');
            crqInput.value = result.changeId;
            crqInput.disabled = false;
            crqInput.style.backgroundColor = '#d4edda';
            crqInput.style.color = '#155724';
            crqInput.style.borderColor = '#28a745';
            crqInput.placeholder = '';
            
            hideCrqCreationMessage();
            showAlert(`✅ CRQ created successfully: ${result.changeId}`, 'success');
            
            // Show ITSM Updates window
            showItsmUpdatesWindow(result.changeId);
            
            validateDeployForm();
        } else {
            throw new Error(result.error || 'Failed to create CRQ');
        }
    } catch (error) {
        hideCrqCreationMessage();
        showAlert(`❌ CRQ creation failed: ${error.message}`, 'error');
        
        // Reset CRQ field to allow manual entry
        const crqInput = document.getElementById('deployCrqId');
        crqInput.disabled = false;
        crqInput.style.backgroundColor = '';
        crqInput.style.color = '';
        crqInput.placeholder = 'Enter CRQ ID manually';
        crqInput.focus();
        validateDeployForm();
    }
}

async function createCrqForDeletion() {
    const stackName = document.getElementById('deleteStackName').value;
    const userInfo = localStorage.getItem('userInfo');
    let userData = null;
    if (userInfo) {
        try {
            userData = JSON.parse(userInfo).data;
        } catch (e) {}
    }
    
    const deploymentData = {
        stack_name: stackName,
        operation: 'delete',
        user_email: userData?.email || 'unknown',
        rte_email: document.getElementById('deleteRte').value
    };
    
    try {
        const response = await fetch('/create-crq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deploymentData })
        });
        
        const result = await response.json();
        const crqInput = document.getElementById('deleteCrqId');
        const validation = document.getElementById('deleteCrqValidation');
        
        if (response.ok && result.success) {
            crqInput.value = result.changeId;
            crqInput.disabled = false;
            crqInput.style.backgroundColor = '';
            crqInput.style.color = '';
            crqInput.placeholder = '';
            validation.textContent = '✓ CRQ created successfully';
            validation.style.color = '#28a745';
            hideCrqCreationMessage();
            
            // Show ITSM Updates window
            showItsmUpdatesWindow(result.changeId);
            
            validateDeleteForm();
        } else {
            crqInput.placeholder = 'CRQ creation failed - please enter manually';
            crqInput.disabled = false;
            crqInput.style.backgroundColor = '';
            crqInput.style.color = '';
            validation.textContent = 'CRQ creation failed: ' + (result.error || 'Unknown error');
            validation.style.color = '#dc3545';
            hideCrqCreationMessage();
        }
    } catch (error) {
        const crqInput = document.getElementById('deleteCrqId');
        const validation = document.getElementById('deleteCrqValidation');
        crqInput.placeholder = 'CRQ creation failed - please enter manually';
        crqInput.disabled = false;
        crqInput.style.backgroundColor = '';
        crqInput.style.color = '';
        validation.textContent = 'CRQ creation failed: ' + error.message;
        validation.style.color = '#dc3545';
        hideCrqCreationMessage();
    }
}

function showCrqCreationMessage() {
    // Show loading message for CRQ creation
}

function hideCrqCreationMessage() {
    // Hide loading message for CRQ creation
}