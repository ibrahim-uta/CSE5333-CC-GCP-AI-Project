import {initializeFirebase} from './firebase-init.js';
import {createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let auth = null;
let authInitialized = false;

// Hide page initially
document.body.style.visibility = 'hidden';

// Timeout fallback - show page after 3 seconds if no redirect
const showPageTimeout = setTimeout(() => {
    console.log('Timeout reached, showing page');
    document.body.style.visibility = 'visible';
}, 3000);

// Initialize Firebase and check auth state immediately
(async() => {
    try {
        const {auth: firebaseAuth} = await initializeFirebase();
        auth = firebaseAuth;
        authInitialized = true;
        
        console.log('Auth initialized, checking state...');
        
        // Immediately check if user is already logged in
        onAuthStateChanged(auth, (user) => {
            const currentPage = window.location.pathname;
            const isLoginPage = currentPage.includes('login.html');
            const isRegisterPage = currentPage.includes('register.html');

            console.log('Auth state changed:', {
                user: user ? user.email : 'none',
                currentPage,
                isLoginPage,
                isRegisterPage
            });

            if (user && (isLoginPage || isRegisterPage)) {
                // User is already logged in, redirect to chat immediately
                console.log('Redirecting to chat...');
                clearTimeout(showPageTimeout);
                window.location.replace('chat.html');
            } else {
                // User not logged in or not on auth page, show the page
                console.log('Showing auth page');
                clearTimeout(showPageTimeout);
                document.body.style.visibility = 'visible';
            }
        });
    } catch (error) {
        console.error('Auth initialization error:', error);
        clearTimeout(showPageTimeout);
        document.body.style.visibility = 'visible';
        showError('Failed to initialize authentication. Please refresh the page.');
    }
})();

// Wait for auth to be initialized
async function waitForAuth() {
    let attempts = 0;
    while (!authInitialized && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    if (!authInitialized) {
        throw new Error('Authentication initialization timeout');
    }
}

// Handle Login
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async(e) => {
        e.preventDefault();

        try {
            await waitForAuth();

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('error-message');
            const submitBtn = e.target.querySelector('button[type="submit"]');

            // Disable button and show loading
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';
            errorDiv.classList.remove('show');

            await signInWithEmailAndPassword(auth, email, password);
            
            // Redirect to chat
            window.location.replace('chat.html');

        } catch (error) {
            const errorDiv = document.getElementById('error-message');
            const submitBtn = document.querySelector('button[type="submit"]');
            
            errorDiv.textContent = getErrorMessage(error.code);
            errorDiv.classList.add('show');
            
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
        }
    });
}

// Handle Registration
if (document.getElementById('registerForm')) {
    document.getElementById('registerForm').addEventListener('submit', async(e) => {
        e.preventDefault();

        try {
            await waitForAuth();

            const username = document.getElementById('username').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('error-message');
            const submitBtn = e.target.querySelector('button[type="submit"]');

            // Client-side validation
            if (username.length < 2) {
                errorDiv.textContent = 'Username must be at least 2 characters';
                errorDiv.classList.add('show');
                return;
            }

            if (password.length < 6) {
                errorDiv.textContent = 'Password must be at least 6 characters';
                errorDiv.classList.add('show');
                return;
            }

            // Disable button and show loading
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating account...';
            errorDiv.classList.remove('show');

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, {displayName: username});
            
            // Redirect to chat
            window.location.replace('chat.html');

        } catch (error) {
            const errorDiv = document.getElementById('error-message');
            const submitBtn = document.querySelector('button[type="submit"]');
            
            errorDiv.textContent = getErrorMessage(error.code);
            errorDiv.classList.add('show');
            
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign Up';
        }
    });
}

function getErrorMessage(errorCode) {
    const errorMessages = {
        'auth/email-already-in-use': 'This email is already registered',
        'auth/invalid-email': 'Please enter a valid email address',
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password. Please try again',
        'auth/weak-password': 'Password must be at least 6 characters',
        'auth/too-many-requests': 'Too many failed attempts. Please try again later',
        'auth/network-request-failed': 'Network error. Please check your connection',
        'auth/invalid-credential': 'Invalid email or password'
    };

    return errorMessages[errorCode] || 'An error occurred. Please try again.';
}

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
    }
}
