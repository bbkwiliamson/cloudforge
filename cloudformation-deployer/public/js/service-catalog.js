// Service Catalog Module
let currentProduct = null;
let provisionRecordId = null;
let terminateProductData = null;

function showServiceCatalogTab(tab) {
    const productsTab = document.getElementById('scProductsTab');
    const provisionedTab = document.getElementById('scProvisionedTab');
    const productList = document.getElementById('scProductList');
    const provisionedList = document.getElementById('scProvisionedList');
    
    // Reset provision status when switching tabs
    document.getElementById('scProvisionStatus').style.display = 'none';
    document.getElementById('scVersionSelection').style.display = 'none';
    document.getElementById('scProductDetails').style.display = 'none';
    
    if (tab === 'products') {
        productsTab.style.background = '#007cba';
        productsTab.style.color = 'white';
        provisionedTab.style.background = '#f8f9fa';
        provisionedTab.style.color = '#333';
        productList.style.display = 'block';
        provisionedList.style.display = 'none';
        loadServiceCatalogProducts();
    } else {
        productsTab.style.background = '#f8f9fa';
        productsTab.style.color = '#333';
        provisionedTab.style.background = '#007cba';
        provisionedTab.style.color = 'white';
        productList.style.display = 'none';
        provisionedList.style.display = 'block';
        loadProvisionedProducts();
    }
}

async function loadProvisionedProducts() {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    // Show loading indicator
    const container = document.getElementById('scProvisionedContainer');
    container.innerHTML = '<div style="text-align: center; padding: 20px;"><div style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #007cba; border-radius: 50%; animation: spin 1s linear infinite;"></div><p style="margin-top: 10px; color: #666;">Loading provisioned resources...</p></div>';
    
    try {
        const response = await fetch('/service-catalog/provisioned-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                region, 
                accessKeyId: atob(accessKeyId), 
                secretAccessKey: atob(secretAccessKey)
            })
        });
        
        const data = await response.json();
        if (response.ok) { displayProvisionedProducts(data.provisionedProducts); }
        else { 
            container.innerHTML = `<p style="text-align: center; color: #dc3545;">Error loading provisioned products: ${data.error}</p>`;
        }
    } catch (error) { 
        container.innerHTML = `<p style="text-align: center; color: #dc3545;">Error: ${error.message}</p>`;
    }
}

function displayProvisionedProducts(products) {
    const container = document.getElementById('scProvisionedContainer');
    container.innerHTML = '';
    
    if (products.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No provisioned products found</p>';
        return;
    }
    
    products.forEach(product => {
        const productDiv = document.createElement('div');
        productDiv.className = 'sc-product-item';
        productDiv.style.cursor = 'pointer';
        productDiv.onclick = (e) => {
            if (!e.target.closest('button')) {
                showProductResources(product.id, product.name);
            }
        };
        
        const statusColor = product.status === 'AVAILABLE' ? '#28a745' : 
                          product.status === 'ERROR' ? '#dc3545' : '#fd7e14';
        
        productDiv.innerHTML = `
            <h4>${product.name}</h4>
            <p><strong>Status:</strong> <span style="color: ${statusColor};">${product.status}</span></p>
            <p><strong>Type:</strong> ${product.type}</p>
            <p><strong>Created:</strong> ${new Date(product.createdTime).toLocaleString()}</p>
            ${product.statusMessage ? `<p><strong>Message:</strong> ${product.statusMessage}</p>` : ''}
            <p style="font-size: 12px; color: #666; font-style: italic;">Click to view resources</p>
            <div style="margin-top: 10px; display: flex; gap: 10px;">
                <button onclick="recreateProduct('${product.id}', '${product.productId}', '${product.provisioningArtifactId}')" class="submit-btn" style="background: #28a745; padding: 5px 10px; font-size: 12px;">Recreate</button>
                <button onclick="terminateProduct('${product.id}', '${product.name}')" class="cancel-btn" style="background: #dc3545; padding: 5px 10px; font-size: 12px;">Terminate</button>
            </div>
        `;
        
        container.appendChild(productDiv);
    });
}

async function terminateProduct(productId, productName) {
    terminateProductData = { productId, productName };
    
    document.getElementById('terminateActionText').textContent = `You're about to delete Service Catalog product:`;
    document.getElementById('terminateProductDetails').innerHTML = `
        <p><strong>Product Name:</strong> ${productName || 'Unknown'}</p>
        <p><strong>Product ID:</strong> ${productId}</p>
        <p style="color: #dc3545; margin-top: 10px;"><strong>Warning:</strong> This will delete the product and all its resources. This action cannot be undone.</p>
    `;
    
    document.getElementById('terminateRte').value = '';
    document.getElementById('terminateEnvironment').value = '';
    document.getElementById('terminateEnvironment').disabled = true;
    document.getElementById('terminateCrqId').value = '';
    document.getElementById('terminateCrqGroup').style.display = 'none';
    document.getElementById('terminateCrqError').style.display = 'none';
    document.getElementById('confirmTerminateBtn').disabled = true;
    
    await loadTerminateEnvironmentRestrictions();
    document.getElementById('terminateConfirmPopup').style.display = 'block';
}

async function loadTerminateEnvironmentRestrictions() {
    const accountId = document.getElementById('accountId').value;
    try {
        const response = await fetch('/check-account-environment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId })
        });
        const data = await response.json();
        const envSelect = document.getElementById('terminateEnvironment');
        const envDiv = envSelect.closest('.popup-form-group');
        const rteGroup = document.getElementById('terminateRteGroup');
        
        // Check if environment selection is required
        if (data.requiresEnvironment === false) {
            // Hide RTE and environment fields for non-PROD accounts
            if (rteGroup) {
                rteGroup.style.display = 'none';
            }
            if (envDiv) {
                envDiv.style.display = 'none';
            }
            envSelect.value = 'NON-PROD';
            // Also hide CRQ field
            const crqGroup = document.getElementById('terminateCrqGroup');
            if (crqGroup) {
                crqGroup.style.display = 'none';
            }
            // Enable the confirm button since no environment selection needed
            document.getElementById('confirmTerminateBtn').disabled = false;
        } else {
            // Show RTE and environment fields for PROD accounts
            if (rteGroup) {
                rteGroup.style.display = 'block';
            }
            if (envDiv) {
                envDiv.style.display = 'block';
            }
            envSelect.innerHTML = '<option value="">Select Environment</option>';
            
            if (data.environmentType === 'all') {
                envSelect.innerHTML += '<option value="DEV">DEV</option><option value="SIT">SIT</option><option value="PROD">PROD</option>';
            } else if (data.environmentType === 'prod_only') {
                envSelect.innerHTML += '<option value="PROD">PROD</option>';
            } else {
                envSelect.innerHTML += '<option value="DEV">DEV</option><option value="SIT">SIT</option>';
            }
        }
    } catch (error) {
        console.error('Error loading environment restrictions:', error);
    }
}

async function validateTerminateForm() {
    const rte = document.getElementById('terminateRte').value;
    const environment = document.getElementById('terminateEnvironment').value;
    const crqId = document.getElementById('terminateCrqId').value.trim();
    const crqGroup = document.getElementById('terminateCrqGroup');
    const crqError = document.getElementById('terminateCrqError');
    const confirmBtn = document.getElementById('confirmTerminateBtn');
    const requiresEnv = window.requiresEnvironment !== false;
    
    if (!requiresEnv) {
        // Non-PROD accounts don't need RTE or environment selection
        confirmBtn.disabled = false;
        return;
    }
    
    if (environment === 'PROD') {
        crqGroup.style.display = 'block';
        
        // Auto-create CRQ if not already created
        if (!crqId) {
            await createTerminateCrq();
        }
        
        const updatedCrqId = document.getElementById('terminateCrqId').value.trim();
        if (updatedCrqId.length > 0 && updatedCrqId.length < 15) {
            crqError.style.display = 'block';
            confirmBtn.disabled = true;
            return;
        } else {
            crqError.style.display = 'none';
        }
        confirmBtn.disabled = !rte || !environment || !updatedCrqId || updatedCrqId.length < 15;
    } else {
        crqGroup.style.display = 'none';
        crqError.style.display = 'none';
        confirmBtn.disabled = !rte || !environment;
    }
}

async function createTerminateCrq() {
    if (!terminateProductData) return;
    
    const productName = terminateProductData.productName || 'Unknown Product';
    const stackName = `${productName} ServiceCatalogProduct`;
    const environment = document.getElementById('terminateEnvironment').value;
    const rteEmail = document.getElementById('terminateRte').value;
    const userInfo = localStorage.getItem('userInfo');
    let userData = null;
    if (userInfo) { try { userData = JSON.parse(userInfo).data; } catch (e) {} }
    
    const crqInput = document.getElementById('terminateCrqId');
    const crqError = document.getElementById('terminateCrqError');
    
    try {
        crqInput.value = 'Creating CRQ...';
        crqInput.style.color = '#666';
        crqError.style.display = 'none';
        
        // First, ensure ITSM authentication
        const authResponse = await fetch('/itsm/authenticate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!authResponse.ok) {
            throw new Error('ITSM authentication failed');
        }
        
        // Now create the CRQ
        const response = await fetch('/create-crq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deploymentData: {
                    stack_name: stackName,
                    user_email: userData?.email || 'unknown',
                    rte_email: rteEmail,
                    environment: environment,
                    account_id: document.getElementById('accountId').value
                }
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            crqInput.value = data.changeId;
            crqInput.style.color = '#28a745';
            
            // Show CRQ update window
            if (data.changeId) {
                showCrqUpdateWindow(data.changeId);
            }
            
            // Re-validate form
            validateTerminateForm();
        } else {
            crqInput.value = '';
            crqError.textContent = `Error: ${data.error}`;
            crqError.style.display = 'block';
        }
    } catch (error) {
        crqInput.value = '';
        crqError.textContent = `Error: ${error.message}`;
        crqError.style.display = 'block';
    }
}

async function confirmTerminate() {
    const rte = document.getElementById('terminateRte').value;
    const environment = document.getElementById('terminateEnvironment').value;
    const crqId = document.getElementById('terminateCrqId').value.trim();
    const requiresEnv = window.requiresEnvironment !== false;
    
    if (!terminateProductData) return;
    
    if (requiresEnv && (!rte || !environment)) {
        showAlert('Please select both RTE and environment', 'warning');
        return;
    }
    
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    const userInfo = localStorage.getItem('userInfo');
    let userData = null;
    if (userInfo) { try { userData = JSON.parse(userInfo).data; } catch (e) {} }
    
    try {
        const response = await fetch('/service-catalog/terminate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provisionedProductId: terminateProductData.productId,
                region,
                accountId: document.getElementById('accountId').value,
                accessKeyId: atob(accessKeyId),
                secretAccessKey: atob(secretAccessKey),
                userEmail: userData?.email || 'unknown',
                rteEmail: rte || null,
                environment: environment || 'NON-PROD',
                crqId
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            closeTerminateConfirm();
            const productName = terminateProductData && terminateProductData.productName ? terminateProductData.productName : 'Unknown Product';
            showAlert(`Termination initiated successfully for "${productName}". Record ID: ${data.recordId}`, 'success');
            // Refresh the provisioned products list after a short delay
            setTimeout(() => {
                loadProvisionedProducts();
            }, 3000);
        } else {
            showAlert('Error terminating product: ' + data.error, 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

function closeTerminateConfirm() {
    document.getElementById('terminateConfirmPopup').style.display = 'none';
    terminateProductData = null;
}

async function recreateProduct(provisionedProductId, productId, artifactId) {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    try {
        const response = await fetch('/service-catalog/product-parameters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provisionedProductId,
                region,
                accessKeyId: atob(accessKeyId),
                secretAccessKey: atob(secretAccessKey)
            })
        });
        
        const data = await response.json();
        if (!response.ok) {
            showAlert('Error loading product parameters: ' + data.error, 'error');
            return;
        }
        
        const detailsResponse = await fetch('/service-catalog/product-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productId: data.productId,
                artifactId: data.artifactId,
                region,
                accessKeyId: atob(accessKeyId),
                secretAccessKey: atob(secretAccessKey)
            })
        });
        
        const detailsData = await detailsResponse.json();
        if (!detailsResponse.ok) {
            showAlert('Error loading product details: ' + detailsData.error, 'error');
            return;
        }
        
        currentProduct = { ...detailsData, name: data.productName };
        
        document.getElementById('scProvisionedList').style.display = 'none';
        document.getElementById('scProductDetails').style.display = 'block';
        document.getElementById('scProductName').textContent = data.productName + ' (Recreate)';
        
        const container = document.getElementById('scParametersContainer');
        container.innerHTML = '';
        
        detailsData.parameters.forEach(param => {
            const div = document.createElement('div');
            div.className = 'popup-form-group';
            
            const existingValue = data.parameters[param.key] || param.defaultValue || '';
            
            if (param.allowedValues && param.allowedValues.length > 0) {
                const options = param.allowedValues.map(val => 
                    `<option value="${val}" ${val === existingValue ? 'selected' : ''}>${val}</option>`
                ).join('');
                div.innerHTML = `<label>${param.key}:</label><select id="sc-param-${param.key}">${!existingValue ? '<option value="">Select...</option>' : ''}${options}</select>`;
            } else {
                const inputType = param.isNoEcho ? 'password' : 'text';
                div.innerHTML = `<label>${param.key}:</label><input type="${inputType}" id="sc-param-${param.key}" placeholder="${param.description}" value="${existingValue}">`;
            }
            container.appendChild(div);
        });
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'popup-form-group';
        nameDiv.innerHTML = `<label>Provisioned Product Name: <span style="color: red;">*</span></label><input type="text" id="scProvisionedProductName" placeholder="Enter unique name for the new product" required oninput="validateScEnvironmentField()">`;
        container.appendChild(nameDiv);
        
        // Add RTE field
        const rteDiv = document.createElement('div');
        rteDiv.className = 'popup-form-group';
        rteDiv.id = 'scRteGroup';
        rteDiv.style.display = 'none';
        rteDiv.innerHTML = `
            <label>RTE (Release Train Engineer):</label>
            <select id="scRte" onchange="validateScRteField()">
                <option value="">Select RTE</option>
                <option value="Xolani.Madonsela@standardbank.co.za">Xolani Madonsela</option>
                <option value="Juanita.DeJong@standardbank.co.za">Juanita De Jong</option>
                <option value="Nqobile.Feleza@standardbank.co.za">Nqobile Feleza</option>
                <option value="Premchand.Anirudh@standardbank.co.za">Prem Anirudh</option>
            </select>
        `;
        container.appendChild(rteDiv);
        
        // Add Environment field for CRQ
        const envDiv = document.createElement('div');
        envDiv.className = 'popup-form-group';
        envDiv.innerHTML = `
            <label>Environment:</label>
            <select id="scEnvironment" onchange="handleScEnvironmentChange()" disabled>
                <option value="">Select Environment</option>
            </select>
        `;
        container.appendChild(envDiv);
        
        // Load environment restrictions
        loadScEnvironmentRestrictions();
        
        // Add CRQ field (initially hidden)
        const crqDiv = document.createElement('div');
        crqDiv.className = 'popup-form-group';
        crqDiv.id = 'scCrqField';
        crqDiv.style.display = 'none';
        crqDiv.innerHTML = `
            <label>CRQ ID:</label>
            <input type="text" id="scCrqId" placeholder="CRQ will be created automatically..." readonly style="background: #f8f9fa;">
            <small id="scCrqValidation" style="color: #666; display: block;"></small>
        `;
        container.appendChild(crqDiv);
        
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

async function openServiceCatalog() {
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    if (!accessKeyId || !secretAccessKey) {
        showAlert('Please configure AWS credentials first', 'warning');
        return;
    }
    
    document.getElementById('serviceCatalogPopup').style.display = 'block';
    
    document.getElementById('scProductList').style.display = 'block';
    document.getElementById('scProvisionedList').style.display = 'none';
    document.getElementById('scVersionSelection').style.display = 'none';
    document.getElementById('scProductDetails').style.display = 'none';
    document.getElementById('scProvisionStatus').style.display = 'none';
    
    showServiceCatalogTab('products');
}

function closeServiceCatalog() {
    document.getElementById('serviceCatalogPopup').style.display = 'none';
    currentProduct = null;
    provisionRecordId = null;
}

async function loadServiceCatalogProducts() {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    // Show loading indicator
    const container = document.getElementById('scProductsContainer');
    container.innerHTML = '<div style="text-align: center; padding: 20px;"><div style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #007cba; border-radius: 50%; animation: spin 1s linear infinite;"></div><p style="margin-top: 10px; color: #666;">Loading Service Catalog products...</p></div>';
    
    try {
        const decodedAccessKey = atob(accessKeyId);
        const decodedSecretKey = atob(secretAccessKey);
        
        const response = await fetch('/service-catalog/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ region, accessKeyId: decodedAccessKey, secretAccessKey: decodedSecretKey })
        });
        
        const data = await response.json();
        if (response.ok) { displayProducts(data.products); }
        else { 
            container.innerHTML = `<p style="text-align: center; color: #dc3545;">Error loading products: ${data.error}</p>`;
        }
    } catch (error) { 
        container.innerHTML = `<p style="text-align: center; color: #dc3545;">Error: ${error.message}</p>`;
    }
}

function displayProducts(products) {
    const container = document.getElementById('scProductsContainer');
    container.innerHTML = '';
    if (products.length === 0) { container.innerHTML = '<p style="text-align: center; color: #666;">No Service Catalog products available</p>'; return; }
    products.forEach(product => {
        const productDiv = document.createElement('div');
        productDiv.className = 'sc-product-item';
        productDiv.innerHTML = `<h4>${product.name}</h4><p>${product.description}</p><small>Owner: ${product.owner}</small>`;
        productDiv.onclick = () => showVersionSelection(product.id, product.name);
        container.appendChild(productDiv);
    });
}

async function showVersionSelection(productId, productName) {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    try {
        const response = await fetch('/service-catalog/product-versions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, region, accessKeyId: atob(accessKeyId), secretAccessKey: atob(secretAccessKey) })
        });
        const data = await response.json();
        if (response.ok) { displayVersions(data.versions, productId, productName); }
        else { showAlert('Error: ' + data.error, 'error'); }
    } catch (error) { showAlert('Error: ' + error.message, 'error'); }
}

function displayVersions(versions, productId, productName) {
    document.getElementById('scProductList').style.display = 'none';
    document.getElementById('scVersionSelection').style.display = 'block';
    document.getElementById('scVersionProductName').textContent = productName;
    const container = document.getElementById('scVersionsContainer');
    container.innerHTML = '';
    versions.forEach(version => {
        const versionDiv = document.createElement('div');
        versionDiv.className = 'sc-product-item';
        versionDiv.innerHTML = `<h4>${version.name}</h4><p>${version.description}</p>`;
        versionDiv.onclick = () => selectProductVersion(productId, productName, version.id);
        container.appendChild(versionDiv);
    });
}

async function selectProductVersion(productId, productName, artifactId) {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    try {
        const response = await fetch('/service-catalog/product-details', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, artifactId, region, accessKeyId: atob(accessKeyId), secretAccessKey: atob(secretAccessKey) })
        });
        const data = await response.json();
        if (response.ok) { currentProduct = { ...data, name: productName }; displayProductDetails(data, productName); }
        else { showAlert('Error: ' + data.error, 'error'); }
    } catch (error) { showAlert('Error: ' + error.message, 'error'); }
}

function displayProductDetails(product, productName) {
    document.getElementById('scVersionSelection').style.display = 'none';
    document.getElementById('scProductDetails').style.display = 'block';
    document.getElementById('scProductName').textContent = productName;
    const container = document.getElementById('scParametersContainer');
    container.innerHTML = '';
    product.parameters.forEach(param => {
        const div = document.createElement('div');
        div.className = 'popup-form-group';
        
        if (param.allowedValues && param.allowedValues.length > 0) {
            const options = param.allowedValues.map(val => 
                `<option value="${val}" ${val === param.defaultValue ? 'selected' : ''}>${val}</option>`
            ).join('');
            div.innerHTML = `<label>${param.key}:</label><select id="sc-param-${param.key}">${!param.defaultValue ? '<option value="">Select...</option>' : ''}${options}</select>`;
        } else {
            const inputType = param.isNoEcho ? 'password' : 'text';
            div.innerHTML = `<label>${param.key}:</label><input type="${inputType}" id="sc-param-${param.key}" placeholder="${param.description}" value="${param.defaultValue}">`;
        }
        container.appendChild(div);
    });
    
    // Add Provisioned Product Name field
    const nameDiv = document.createElement('div');
    nameDiv.className = 'popup-form-group';
    nameDiv.innerHTML = `<label>Provisioned Product Name: <span style="color: red;">*</span></label><input type="text" id="scProvisionedProductName" placeholder="Enter unique name" required oninput="validateScEnvironmentField()">`;
    container.appendChild(nameDiv);
    
    // Add RTE field
    const rteDiv = document.createElement('div');
    rteDiv.className = 'popup-form-group';
    rteDiv.id = 'scRteGroup';
    rteDiv.style.display = 'none';
    rteDiv.innerHTML = `
        <label>RTE (Release Train Engineer):</label>
        <input type="email" id="scRte" list="scRteOptions" onchange="validateScRteField()" placeholder="Select from list or enter custom email..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" required>
        <datalist id="scRteOptions">
            <option value="Xolani.Madonsela@standardbank.co.za">Xolani Madonsela</option>
            <option value="Juanita.DeJong@standardbank.co.za">Juanita De Jong</option>
            <option value="Nqobile.Feleza@standardbank.co.za">Nqobile Feleza</option>
            <option value="Premchand.Anirudh@standardbank.co.za">Prem Anirudh</option>
        </datalist>
    `;
    container.appendChild(rteDiv);
    
    // Add Environment field for CRQ
    const envDiv = document.createElement('div');
    envDiv.className = 'popup-form-group';
    envDiv.innerHTML = `
        <label>Environment:</label>
        <select id="scEnvironment" onchange="handleScEnvironmentChange()" disabled>
            <option value="">Select Environment</option>
        </select>
    `;
    container.appendChild(envDiv);
    
    // Load environment restrictions
    loadScEnvironmentRestrictions();
    
    // Add CRQ field (initially hidden)
    const crqDiv = document.createElement('div');
    crqDiv.className = 'popup-form-group';
    crqDiv.id = 'scCrqField';
    crqDiv.style.display = 'none';
    crqDiv.innerHTML = `
        <label>CRQ ID:</label>
        <input type="text" id="scCrqId" placeholder="CRQ will be created automatically..." readonly style="background: #f8f9fa;">
        <small id="scCrqValidation" style="color: #666; display: block;"></small>
    `;
    container.appendChild(crqDiv);
}

function goBackToProducts() { 
    document.getElementById('scProductDetails').style.display = 'none'; 
    document.getElementById('scVersionSelection').style.display = 'none';
    showServiceCatalogTab('products');
    currentProduct = null; 
}

function goBackToVersions() {
    document.getElementById('scProductDetails').style.display = 'none';
    document.getElementById('scVersionSelection').style.display = 'block';
}

// Service Catalog environment restrictions
async function loadScEnvironmentRestrictions() {
    const accountId = document.getElementById('accountId').value;
    try {
        const response = await fetch('/check-account-environment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId })
        });
        const data = await response.json();
        const envSelect = document.getElementById('scEnvironment');
        const envDiv = envSelect.closest('.popup-form-group');
        const rteGroup = document.getElementById('scRteGroup');
        
        // Check if environment selection is required
        if (data.requiresEnvironment === false) {
            // Hide RTE and environment fields for non-PROD accounts
            if (rteGroup) {
                rteGroup.style.display = 'none';
            }
            if (envDiv) {
                envDiv.style.display = 'none';
            }
            envSelect.value = 'NON-PROD';
            envSelect.disabled = false; // Enable but hidden
            // Also hide CRQ field
            const crqField = document.getElementById('scCrqField');
            if (crqField) {
                crqField.style.display = 'none';
            }
        } else {
            // Show RTE and environment fields for PROD accounts
            if (rteGroup) {
                rteGroup.style.display = 'block';
            }
            if (envDiv) {
                envDiv.style.display = 'block';
            }
            envSelect.innerHTML = '<option value="">Select Environment</option>';
            
            if (data.environmentType === 'all') {
                envSelect.innerHTML += '<option value="DEV">DEV Account</option><option value="SIT">SIT Account</option><option value="PROD">PROD Account</option>';
            } else if (data.environmentType === 'prod_only') {
                envSelect.innerHTML += '<option value="PROD">PROD Account</option>';
            } else {
                envSelect.innerHTML += '<option value="DEV">DEV Account</option><option value="SIT">SIT Account</option>';
            }
        }
    } catch (error) {
        console.error('Error loading environment restrictions:', error);
        // Default to non-prod if error
        const envSelect = document.getElementById('scEnvironment');
        envSelect.innerHTML = '<option value="">Select Environment</option><option value="DEV">DEV Account</option><option value="SIT">SIT Account</option>';
    }
}

// Service Catalog CRQ update window function
function showCrqUpdateWindow(crqId) {
    showItsmUpdatesWindow(crqId);
}

// Service Catalog validation and CRQ functions
function validateScEnvironmentField() {
    const productName = document.getElementById('scProvisionedProductName').value.trim();
    const rteSelect = document.getElementById('scRte');
    
    if (productName) {
        // Enable RTE field if product name is provided
        const rteGroup = document.getElementById('scRteGroup');
        const requiresEnv = window.requiresEnvironment !== false;
        if (requiresEnv && rteGroup && rteGroup.style.display !== 'none') {
            rteSelect.disabled = false;
        }
    } else {
        // Disable and reset RTE and environment fields
        if (rteSelect) {
            rteSelect.disabled = true;
            rteSelect.value = '';
        }
        const envSelect = document.getElementById('scEnvironment');
        if (envSelect) {
            envSelect.disabled = true;
            envSelect.value = '';
        }
        document.getElementById('scCrqField').style.display = 'none';
    }
}

function validateScRteField() {
    const rte = document.getElementById('scRte').value.trim();
    const envSelect = document.getElementById('scEnvironment');
    
    if (rte) {
        envSelect.disabled = false;
        envSelect.style.backgroundColor = '';
        envSelect.style.color = '';
    } else {
        envSelect.disabled = true;
        envSelect.value = '';
        envSelect.style.backgroundColor = '#f5f5f5';
        envSelect.style.color = '#666';
        document.getElementById('scCrqField').style.display = 'none';
        document.getElementById('scCrqId').value = '';
    }
}

function validateTerminateRteForm() {
    const rte = document.getElementById('terminateRte').value.trim();
    const envSelect = document.getElementById('terminateEnvironment');
    
    if (rte) {
        envSelect.disabled = false;
        envSelect.style.backgroundColor = '';
        envSelect.style.color = '';
    } else {
        envSelect.disabled = true;
        envSelect.value = '';
        envSelect.style.backgroundColor = '#f5f5f5';
        envSelect.style.color = '#666';
        document.getElementById('terminateCrqGroup').style.display = 'none';
        document.getElementById('terminateCrqId').value = '';
    }
    validateTerminateForm();
}

async function handleScEnvironmentChange() {
    const environment = document.getElementById('scEnvironment').value;
    const crqField = document.getElementById('scCrqField');
    const crqInput = document.getElementById('scCrqId');
    const crqValidation = document.getElementById('scCrqValidation');
    
    if (environment === 'PROD') {
        crqField.style.display = 'block';
        crqInput.value = '';
        crqValidation.textContent = 'Creating CRQ...';
        crqValidation.style.color = '#666';
        
        // Create CRQ for Service Catalog
        await createScCrq();
    } else {
        crqField.style.display = 'none';
        crqInput.value = '';
        crqValidation.textContent = '';
    }
}

async function createScCrq() {
    const productName = document.getElementById('scProvisionedProductName').value.trim();
    const stackName = `${productName} ServiceCatalogProduct`;
    const environment = document.getElementById('scEnvironment').value; // Get the actual selected environment value
    const rteEmail = document.getElementById('scRte').value;
    const userInfo = localStorage.getItem('userInfo');
    let userData = null;
    if (userInfo) { try { userData = JSON.parse(userInfo).data; } catch (e) {} }
    
    const crqInput = document.getElementById('scCrqId');
    const crqValidation = document.getElementById('scCrqValidation');
    
    try {
        // First, ensure ITSM authentication
        crqValidation.textContent = 'Authenticating with ITSM...';
        crqValidation.style.color = '#666';
        
        const authResponse = await fetch('/itsm/authenticate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!authResponse.ok) {
            throw new Error('ITSM authentication failed');
        }
        
        // Now create the CRQ
        crqValidation.textContent = 'Creating CRQ...';
        
        const response = await fetch('/create-crq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deploymentData: {
                    stack_name: stackName,  // This will be used in INP_Notes as: "CloudForge User Initiated CloudFormation operational changes for {stackName}"
                    user_email: userData?.email || 'unknown',
                    rte_email: rteEmail,
                    environment: environment, // Use the actual selected environment (DEV/SIT/PROD)
                    account_id: document.getElementById('accountId').value
                }
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            crqInput.value = data.changeId;
            crqValidation.textContent = '✓ CRQ created successfully';
            crqValidation.style.color = '#28a745';
            
            // Show CRQ update window
            if (data.changeId) {
                showCrqUpdateWindow(data.changeId);
            }
        } else {
            crqValidation.textContent = `Error: ${data.error}`;
            crqValidation.style.color = '#dc3545';
        }
    } catch (error) {
        crqValidation.textContent = `Error: ${error.message}`;
        crqValidation.style.color = '#dc3545';
    }
}

function clearProductFields() { 
    document.querySelectorAll('[id^="sc-param-"]').forEach(input => input.value = ''); 
    document.getElementById('scProvisionedProductName').value = ''; 
    document.getElementById('scRte').value = '';
    document.getElementById('scEnvironment').value = '';
    document.getElementById('scEnvironment').disabled = true;
    document.getElementById('scCrqField').style.display = 'none';
    document.getElementById('scCrqId').value = '';
}
async function provisionProduct() {
    const provisionedProductName = document.getElementById('scProvisionedProductName').value;
    if (!provisionedProductName) { showAlert('Please enter a provisioned product name', 'warning'); return; }
    
    const requiresEnv = window.requiresEnvironment !== false;
    const rte = document.getElementById('scRte').value;
    const environment = document.getElementById('scEnvironment').value;
    
    if (requiresEnv && (!rte || !environment)) { 
        showAlert('Please select both RTE and environment', 'warning'); 
        return; 
    }
    
    // For PROD environment, ensure CRQ is created
    if (environment === 'PROD') {
        const crqId = document.getElementById('scCrqId').value;
        if (!crqId) { showAlert('CRQ creation is required for PROD environment', 'warning'); return; }
    }
    
    const inputs = document.querySelectorAll('[id^="sc-param-"]');
    for (let input of inputs) { if (!input.value.trim()) { showAlert('Please fill in all required fields', 'warning'); return; } }
    const parameters = {};
    inputs.forEach(input => { parameters[input.id.replace('sc-param-', '')] = input.value; });
    const userInfo = localStorage.getItem('userInfo');
    let userData = null;
    if (userInfo) { try { userData = JSON.parse(userInfo).data; } catch (e) {} }
    document.getElementById('scProductDetails').style.display = 'none';
    document.getElementById('scProvisionStatus').style.display = 'block';
    document.getElementById('scLoadingMessage').style.display = 'block';
    document.getElementById('scResultMessage').style.display = 'none';
    try {
        const response = await fetch('/service-catalog/provision', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: currentProduct.productId, artifactId: currentProduct.artifactId, parameters, provisionedProductName,
                region: document.getElementById('region').value, accountId: document.getElementById('accountId').value,
                accessKeyId: atob(document.getElementById('accessKeyId').value), secretAccessKey: atob(document.getElementById('secretAccessKey').value),
                userEmail: userData?.email || 'unknown', rteEmail: rte || null, environment: environment || 'NON-PROD', crqId: document.getElementById('scCrqId').value })
        });
        const data = await response.json();
        if (response.ok) { provisionRecordId = data.recordId; pollProvisionStatus(); }
        else { showProvisionError(data.error); }
    } catch (error) { showProvisionError(error.message); }
}

async function pollProvisionStatus() {
    try {
        const response = await fetch('/service-catalog/provision-status', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recordId: provisionRecordId, region: document.getElementById('region').value,
                accessKeyId: atob(document.getElementById('accessKeyId').value), secretAccessKey: atob(document.getElementById('secretAccessKey').value) })
        });
        const data = await response.json();
        if (response.ok) {
            if (data.status === 'SUCCEEDED') { showProvisionSuccess(data.outputs); }
            else if (data.status === 'FAILED' || data.status === 'ERROR') { showProvisionError('Provisioning failed', data.errorDetails, data.provisionedProductId); }
            else { setTimeout(pollProvisionStatus, 5000); }
        } else { showProvisionError(data.error); }
    } catch (error) { showProvisionError(error.message); }
}

function showProvisionSuccess(outputs) {
    document.getElementById('scLoadingMessage').style.display = 'none';
    document.getElementById('scResultMessage').style.display = 'block';
    let outputsHtml = '<h4 style="color: #28a745;">✓ Provisioning Successful!</h4><div style="margin: 15px 0;">';
    if (Object.keys(outputs).length > 0) {
        outputsHtml += '<h5>Resource Details:</h5>';
        for (const [key, value] of Object.entries(outputs)) { outputsHtml += `<p><strong>${key}:</strong> ${value}</p>`; }
    }
    outputsHtml += '<p style="color: #666; font-size: 14px; margin-top: 15px;">You can view your resource in "My Resources" tab.</p>';
    outputsHtml += '</div>';
    document.getElementById('scOutputs').innerHTML = outputsHtml;
    document.getElementById('scCloseButton').style.display = 'inline-block';
    
    // Hide success message after 10 seconds
    setTimeout(() => {
        document.getElementById('scProvisionStatus').style.display = 'none';
    }, 10000);
}

function showProvisionError(error, errorDetails = [], provisionedProductId = '') {
    document.getElementById('scLoadingMessage').style.display = 'none';
    document.getElementById('scResultMessage').style.display = 'block';
    
    let errorHtml = `<h4 style="color: #dc3545;">✗ Provisioning Failed</h4><p>${error}</p>`;
    
    if (errorDetails && errorDetails.length > 0) {
        errorHtml += '<div style="margin: 15px 0; padding: 15px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 5px;">';
        errorHtml += '<h5 style="color: #721c24; margin-top: 0;">Error Details:</h5>';
        errorDetails.forEach(detail => {
            errorHtml += `<div style="margin: 10px 0;"><strong>${detail.code}:</strong> ${detail.description}</div>`;
        });
        errorHtml += '</div>';
    }
    
    if (provisionedProductId) {
        errorHtml += `<div style="margin: 15px 0;"><button onclick="deleteFailedProduct('${provisionedProductId}')" style="background: #dc3545; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">Delete Failed Product</button></div>`;
    }
    
    document.getElementById('scOutputs').innerHTML = errorHtml;
    document.getElementById('scCloseButton').style.display = 'inline-block';
    
    // Clear error message after 2 minutes
    setTimeout(() => {
        document.getElementById('scResultMessage').style.display = 'none';
        document.getElementById('scLoadingMessage').style.display = 'none';
    }, 120000);
}

function closeServiceCatalogWithMessage() { 
    closeServiceCatalog(); 
}

async function showProductResources(productId, productName) {
    document.getElementById('productResourcesTitle').textContent = `Resources for: ${productName}`;
    document.getElementById('productResourcesContent').innerHTML = '<div class="sc-loading"><div class="sc-spinner"></div><p>Loading resources...</p></div>';
    document.getElementById('productResourcesPopup').style.display = 'block';
    
    try {
        const response = await fetch('/service-catalog/product-resources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provisionedProductId: productId,
                region: document.getElementById('region').value,
                accessKeyId: atob(document.getElementById('accessKeyId').value),
                secretAccessKey: atob(document.getElementById('secretAccessKey').value)
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            if (data.error) {
                document.getElementById('productResourcesContent').innerHTML = `<p style="color: #fd7e14;">${data.error}</p>`;
            } else {
                displayProductResources(data.resources, data.stackId);
            }
        } else {
            document.getElementById('productResourcesContent').innerHTML = `<p style="color: #dc3545;">Error: ${data.error}</p>`;
        }
    } catch (error) {
        document.getElementById('productResourcesContent').innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
    }
}

function displayProductResources(resources, stackId) {
    const container = document.getElementById('productResourcesContent');
    
    if (resources.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">No resources found</p>';
        return;
    }
    
    let html = `<p style="margin-bottom: 15px;"><strong>CloudFormation Stack:</strong> ${stackId}</p>`;
    html += '<table style="width: 100%; border-collapse: collapse;">';
    html += '<thead><tr style="background: #f8f9fa; border-bottom: 2px solid #007cba;">';
    html += '<th style="padding: 10px; text-align: left;">Logical ID</th>';
    html += '<th style="padding: 10px; text-align: left;">Type</th>';
    html += '<th style="padding: 10px; text-align: left;">Physical ID</th>';
    html += '<th style="padding: 10px; text-align: left;">Status</th>';
    html += '</tr></thead><tbody>';
    
    resources.forEach((resource, index) => {
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
        const statusColor = resource.status.includes('COMPLETE') ? '#28a745' : 
                          resource.status.includes('FAILED') ? '#dc3545' : '#fd7e14';
        html += `<tr style="background: ${bgColor}; border-bottom: 1px solid #ddd;">`;
        html += `<td style="padding: 10px;">${resource.logicalId}</td>`;
        html += `<td style="padding: 10px; font-size: 12px;">${resource.type}</td>`;
        html += `<td style="padding: 10px; word-break: break-all; font-size: 12px;">${resource.physicalId}</td>`;
        html += `<td style="padding: 10px; color: ${statusColor}; font-weight: bold;">${resource.status}</td>`;
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function closeProductResources() {
    document.getElementById('productResourcesPopup').style.display = 'none';
}

async function deleteFailedProduct(provisionedProductId) {
    if (!confirm('Are you sure you want to delete this failed product? This will remove it from Service Catalog.')) {
        return;
    }
    
    try {
        const response = await fetch('/service-catalog/terminate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provisionedProductId,
                region: document.getElementById('region').value,
                accountId: document.getElementById('accountId').value,
                accessKeyId: atob(document.getElementById('accessKeyId').value),
                secretAccessKey: atob(document.getElementById('secretAccessKey').value),
                userEmail: JSON.parse(localStorage.getItem('userInfo')).data.email
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            showAlert('Failed product deleted successfully', 'success');
            document.querySelector(`button[onclick="deleteFailedProduct('${provisionedProductId}')"]`).style.display = 'none';
        } else {
            showAlert('Error deleting failed product: ' + data.error, 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}