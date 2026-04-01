// Tutorial System Module
let currentTutorialStep = 0;
const tutorialSteps = [
    {
        target: '.test-credentials-container button[onclick="openAwsConfig()"]',
        title: 'AWS Configuration',
        message: 'This is for AWS account credentials and you must configure before anything else could function',
        position: 'bottom'
    },
    {
        target: '.test-credentials-container .service-catalog-btn',
        title: 'Service Catalog',
        message: 'This is for accessing and using AWS Service Catalog',
        position: 'bottom'
    },
    {
        target: 'button[onclick="openVpcHelper()"]',
        title: 'VPC Helper',
        message: 'To choose and list everything related to VPC',
        position: 'right'
    },
    {
        target: 'button[onclick="openITSM()"][style*="#6f42c1"]',
        title: 'ITSM Access',
        message: 'For accessing ITSM CRQ site',
        position: 'right'
    }
];

async function checkTutorialStatus() {
    try {
        const userInfo = localStorage.getItem('userInfo');
        if (!userInfo) {
            return;
        }
        
        const parsed = JSON.parse(userInfo);
        const userEmail = parsed.data.email;
        const lastTutorial = parseInt(localStorage.getItem(`tutorial_${userEmail}`) || '0');
        
        // If user has never seen tutorial, show it
        if (lastTutorial === 0) {
            setTimeout(() => startTutorial(), 1000);
            return;
        }
        
        // Check if 365 days have passed
        const currentTime = Date.now();
        const days365Ms = 365 * 24 * 60 * 60 * 1000;
        
        if ((currentTime - lastTutorial) >= days365Ms) {
            setTimeout(() => startTutorial(), 1000);
        }
    } catch (error) {
        console.error('Error checking tutorial status:', error);
    }
}

function startTutorial() {
    currentTutorialStep = 0;
    showTutorialStep();
}

function showTutorialStep() {
    if (currentTutorialStep >= tutorialSteps.length) {
        completeTutorial();
        return;
    }
    
    const step = tutorialSteps[currentTutorialStep];
    const targetElement = document.querySelector(step.target);
    
    if (!targetElement) {
        currentTutorialStep++;
        showTutorialStep();
        return;
    }
    
    // Create tutorial overlay if it doesn't exist
    if (!document.getElementById('tutorialOverlay')) {
        const tutorialHTML = `
            <div class="tutorial-overlay" id="tutorialOverlay">
                <div class="tutorial-popup" id="tutorialPopup">
                    <h4 id="tutorialTitle">Welcome to CloudForge!</h4>
                    <p id="tutorialMessage">This is your first time using CloudForge. Let me show you around!</p>
                    <button class="tutorial-ok-btn" onclick="nextTutorialStep()">OK</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', tutorialHTML);
    }
    
    const overlay = document.getElementById('tutorialOverlay');
    const popup = document.getElementById('tutorialPopup');
    const title = document.getElementById('tutorialTitle');
    const message = document.getElementById('tutorialMessage');
    
    title.textContent = step.title;
    message.textContent = step.message;
    
    const rect = targetElement.getBoundingClientRect();
    popup.className = 'tutorial-popup';
    
    let top, left;
    
    switch (step.position) {
        case 'bottom':
            top = rect.bottom + 15;
            left = rect.left + (rect.width / 2) - 150;
            popup.classList.add('arrow-top');
            break;
        case 'right':
            top = rect.top + (rect.height / 2) - 50;
            left = rect.right + 15;
            popup.classList.add('arrow-left');
            break;
    }
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (left < 10) left = 10;
    if (left + 300 > viewportWidth) left = viewportWidth - 310;
    if (top < 10) top = 10;
    if (top + 120 > viewportHeight) top = viewportHeight - 130;
    
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
    
    overlay.style.display = 'block';
}

function nextTutorialStep() {
    currentTutorialStep++;
    showTutorialStep();
}

function completeTutorial() {
    const overlay = document.getElementById('tutorialOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
    
    try {
        const userInfo = localStorage.getItem('userInfo');
        if (userInfo) {
            const parsed = JSON.parse(userInfo);
            const userEmail = parsed.data.email;
            const currentTime = Date.now();
            localStorage.setItem(`tutorial_${userEmail}`, currentTime.toString());
        }
    } catch (error) {
        console.error('Error saving tutorial completion:', error);
    }
}