// Authentication and Session Management
function checkAuthentication() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userInfo = localStorage.getItem('userInfo');
    
    if (isLoggedIn !== 'true' || !userInfo) {
        redirectToLogin();
        return false;
    }
    
    try {
        const parsed = JSON.parse(userInfo);
        const now = Date.now();
        const expired = now - parsed.timestamp >= parsed.expiry;
        
        if (expired) {
            alert('Session expired. Redirecting to login...');
            redirectToLogin();
            return false;
        }
        return true;
    } catch (e) {
        redirectToLogin();
        return false;
    }
}

function redirectToLogin() {
    // Get user email before clearing localStorage
    const userInfo = localStorage.getItem('userInfo');
    let tutorialTimestamp = null;
    if (userInfo) {
        try {
            const parsed = JSON.parse(userInfo);
            const userEmail = parsed.data.email;
            tutorialTimestamp = localStorage.getItem(`tutorial_${userEmail}`);
        } catch (e) {}
    }
    
    localStorage.clear();
    
    // Restore tutorial timestamp if it existed
    if (tutorialTimestamp && userInfo) {
        try {
            const parsed = JSON.parse(userInfo);
            const userEmail = parsed.data.email;
            localStorage.setItem(`tutorial_${userEmail}`, tutorialTimestamp);
        } catch (e) {}
    }
    
    try {
        window.location.replace('./login.html');
    } catch (e) {
        window.location.href = './login.html';
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Get user email before clearing localStorage
        const userInfo = localStorage.getItem('userInfo');
        let tutorialTimestamp = null;
        if (userInfo) {
            try {
                const parsed = JSON.parse(userInfo);
                const userEmail = parsed.data.email;
                tutorialTimestamp = localStorage.getItem(`tutorial_${userEmail}`);
            } catch (e) {}
        }
        
        // Clear session data but preserve tutorial timestamp
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userInfo');
        localStorage.removeItem('awsConfig');
        
        // Restore tutorial timestamp if it existed
        if (tutorialTimestamp && userInfo) {
            try {
                const parsed = JSON.parse(userInfo);
                const userEmail = parsed.data.email;
                localStorage.setItem(`tutorial_${userEmail}`, tutorialTimestamp);
            } catch (e) {}
        }
        
        window.location.href = 'login.html';
    }
}

function displayUserEmail() {
    const userInfo = localStorage.getItem('userInfo');
    if (userInfo) {
        try {
            const parsed = JSON.parse(userInfo);
            const email = parsed.data.email || 'User';
            document.getElementById('userEmailDisplay').textContent = email;
        } catch (e) {
            console.error('Error displaying user email:', e);
        }
    }
}

function startSessionMonitor() {
    setInterval(checkAuthentication, 5 * 1000);
}

// Data storage utilities
function storeData(key, data) {
    const item = {
        data: data,
        timestamp: Date.now(),
        expiry: 8 * 60 * 60 * 1000 // 8 hours in milliseconds
    };
    localStorage.setItem(key, JSON.stringify(item));
}

async function checkCloudForgeAccess() {
    try {
        const userInfo = localStorage.getItem('userInfo');
        if (!userInfo) return false;
        
        const parsed = JSON.parse(userInfo);
        const userEmail = parsed.data.email;
        
        const response = await fetch('/check-cloudforge-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail })
        });
        
        const data = await response.json();
        return response.ok && data.authorized;
    } catch (error) {
        console.error('Error checking CloudForge access:', error);
        return false;
    }
}

function getStoredData(key) {
    const item = localStorage.getItem(key);
    if (!item) return null;
    
    try {
        const parsed = JSON.parse(item);
        const now = Date.now();
        
        if (now - parsed.timestamp > parsed.expiry) {
            localStorage.removeItem(key);
            return null;
        }
        
        return parsed.data;
    } catch (e) {
        localStorage.removeItem(key);
        return null;
    }
}
