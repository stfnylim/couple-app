// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBHC6WOG9Z2qI6XoeAxuqVAHwqhxPAGcE0",
    authDomain: "couple-app-18d2d.firebaseapp.com",
    projectId: "couple-app-18d2d",
    storageBucket: "couple-app-18d2d.firebasestorage.app",
    messagingSenderId: "759079152321",
    appId: "1:759079152321:web:a8c9a0b558529f2f414240",
    measurementId: "G-9ZZE93EHKE"
};

// ==========================================
// APP STATE
// ==========================================
let db = null;
let isOnline = navigator.onLine;
let dates = [];
let recipes = [];
let plans = [];

// ==========================================
// INITIALIZE APP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    initEventListeners();
    initServiceWorker();
    updateSyncStatus();
});

function initFirebase() {
    try {
        // Check if Firebase config is set
        if (firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.warn("Firebase not configured. Using local storage only.");
            loadFromLocalStorage();
            renderAll();
            return;
        }

        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();

        // Enable offline persistence
        db.enablePersistence().catch((err) => {
            console.log("Persistence error:", err);
        });

        // Load local data first, then sync with Firebase
        loadFromLocalStorage();
        renderAll();

        // Listen for real-time updates
        setupRealtimeListeners();

    } catch (error) {
        console.error("Firebase init error:", error);
        loadFromLocalStorage();
        renderAll();
    }
}

function setupRealtimeListeners() {
    // Listen for dates collection
    db.collection('dates').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        dates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        saveToLocalStorage();
        renderDates();
        updateDateSelectorList();
        updateSyncStatus('synced');
    }, (error) => {
        console.error("Dates listener error:", error);
        updateSyncStatus('offline');
    });

    // Listen for recipes collection
    db.collection('recipes').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        saveToLocalStorage();
        renderRecipes();
        updateSyncStatus('synced');
    }, (error) => {
        console.error("Recipes listener error:", error);
        updateSyncStatus('offline');
    });

    // Listen for plans collection
    db.collection('plans').orderBy('date', 'asc').onSnapshot((snapshot) => {
        plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        saveToLocalStorage();
        renderPlans();
        updateSyncStatus('synced');
    }, (error) => {
        console.error("Plans listener error:", error);
        updateSyncStatus('offline');
    });
}

// ==========================================
// LOCAL STORAGE FALLBACK
// ==========================================
function loadFromLocalStorage() {
    dates = JSON.parse(localStorage.getItem('dates') || '[]');
    recipes = JSON.parse(localStorage.getItem('recipes') || '[]');
    plans = JSON.parse(localStorage.getItem('plans') || '[]');
}

function saveToLocalStorage() {
    localStorage.setItem('dates', JSON.stringify(dates));
    localStorage.setItem('recipes', JSON.stringify(recipes));
    localStorage.setItem('plans', JSON.stringify(plans));
}

// ==========================================
// SYNC STATUS
// ==========================================
function updateSyncStatus(status) {
    const statusEl = document.getElementById('syncStatus');
    statusEl.className = 'sync-status ' + (status || (isOnline ? 'synced' : 'offline'));
    statusEl.title = status === 'synced' ? 'Synced' : status === 'syncing' ? 'Syncing...' : 'Offline';
}

window.addEventListener('online', () => {
    isOnline = true;
    updateSyncStatus('syncing');
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncStatus('offline');
});

// ==========================================
// EVENT LISTENERS
// ==========================================
function initEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => filterDates(btn.dataset.filter));
    });

    // Modal close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });

    // FAB buttons
    document.getElementById('addDateBtn').addEventListener('click', () => openDateModal());
    document.getElementById('addRecipeBtn').addEventListener('click', () => openRecipeModal());
    document.getElementById('addPlanBtn').addEventListener('click', () => openPlanModal());

    // Form submissions
    document.getElementById('dateForm').addEventListener('submit', handleDateSubmit);
    document.getElementById('recipeForm').addEventListener('submit', handleRecipeSubmit);
    document.getElementById('planForm').addEventListener('submit', handlePlanSubmit);

    // Confirm delete
    document.getElementById('confirmDeleteBtn').addEventListener('click', handleConfirmDelete);
}

// ==========================================
// TAB NAVIGATION
// ==========================================
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`${tab}Section`).classList.add('active');
}

// ==========================================
// FILTER DATES
// ==========================================
function filterDates(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-filter="${filter}"]`).classList.add('active');

    const cards = document.querySelectorAll('.date-card');
    cards.forEach(card => {
        if (filter === 'all') {
            card.style.display = 'block';
        } else {
            const tags = card.dataset.tags ? card.dataset.tags.split(',') : [];
            card.style.display = tags.includes(filter) ? 'block' : 'none';
        }
    });
}

// ==========================================
// MODALS
// ==========================================
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    document.body.style.overflow = '';
}

function openDateModal(dateData = null) {
    const form = document.getElementById('dateForm');
    const title = document.getElementById('dateModalTitle');

    form.reset();
    document.querySelectorAll('.tags-selector input').forEach(cb => cb.checked = false);

    if (dateData) {
        title.textContent = 'Edit Date Idea';
        document.getElementById('dateId').value = dateData.id;
        document.getElementById('dateName').value = dateData.name || '';
        document.getElementById('dateLocation').value = dateData.location || '';
        document.getElementById('dateAddress').value = dateData.address || '';
        document.getElementById('dateNotes').value = dateData.notes || '';

        (dateData.tags || []).forEach(tag => {
            const cb = document.querySelector(`.tags-selector input[value="${tag}"]`);
            if (cb) cb.checked = true;
        });
    } else {
        title.textContent = 'Add Date Idea';
        document.getElementById('dateId').value = '';
    }

    openModal('dateModal');
}

function openRecipeModal(recipeData = null) {
    const form = document.getElementById('recipeForm');
    const title = document.getElementById('recipeModalTitle');

    form.reset();

    if (recipeData) {
        title.textContent = 'Edit Recipe';
        document.getElementById('recipeId').value = recipeData.id;
        document.getElementById('recipeName').value = recipeData.name || '';
        document.getElementById('recipeTime').value = recipeData.time || '';
        document.getElementById('recipeServings').value = recipeData.servings || '';
        document.getElementById('recipeIngredients').value = (recipeData.ingredients || []).join('\n');
        document.getElementById('recipeInstructions').value = recipeData.instructions || '';
        document.getElementById('recipeLink').value = recipeData.link || '';
    } else {
        title.textContent = 'Add Recipe';
        document.getElementById('recipeId').value = '';
    }

    openModal('recipeModal');
}

function openPlanModal() {
    document.getElementById('planForm').reset();
    document.getElementById('planId').value = '';
    updateDateSelectorList();
    openModal('planModal');
}

function openPlanModalForEdit(planData) {
    document.getElementById('planForm').reset();
    document.getElementById('planId').value = planData.id;
    document.getElementById('planDate').value = planData.date || '';
    document.getElementById('planTime').value = planData.time || '';
    document.getElementById('planTitle').value = planData.title || '';
    document.getElementById('planNotes').value = planData.notes || '';

    updateDateSelectorList();

    // Check the selected date ideas
    (planData.dateIds || []).forEach(id => {
        const checkbox = document.querySelector(`#dateSelectorList input[value="${id}"]`);
        if (checkbox) checkbox.checked = true;
    });

    // Check the selected recipes
    (planData.recipeIds || []).forEach(id => {
        const checkbox = document.querySelector(`#recipeSelectorList input[value="${id}"]`);
        if (checkbox) checkbox.checked = true;
    });

    openModal('planModal');
}

function updateDateSelectorList() {
    const container = document.getElementById('dateSelectorList');

    if (dates.length === 0) {
        container.innerHTML = '<p style="padding: 10px; color: #888;">No date ideas yet.</p>';
    } else {
        container.innerHTML = dates.map(date => `
            <label class="date-select-option">
                <input type="checkbox" value="${date.id}">
                <span>${date.name}</span>
            </label>
        `).join('');
    }

    // Also update recipe selector
    updateRecipeSelectorList();
}

function updateRecipeSelectorList() {
    const container = document.getElementById('recipeSelectorList');

    if (recipes.length === 0) {
        container.innerHTML = '<p style="padding: 10px; color: #888;">No recipes yet.</p>';
    } else {
        container.innerHTML = recipes.map(recipe => `
            <label class="date-select-option">
                <input type="checkbox" value="${recipe.id}">
                <span>${recipe.name}</span>
            </label>
        `).join('');
    }
}

// ==========================================
// FORM HANDLERS
// ==========================================
async function handleDateSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('dateId').value;
    const tags = Array.from(document.querySelectorAll('.tags-selector input:checked')).map(cb => cb.value);

    const dateData = {
        name: document.getElementById('dateName').value.trim(),
        location: document.getElementById('dateLocation').value.trim(),
        address: document.getElementById('dateAddress').value.trim(),
        notes: document.getElementById('dateNotes').value.trim(),
        tags: tags,
        updatedAt: new Date().toISOString()
    };

    try {
        updateSyncStatus('syncing');

        if (db) {
            if (id) {
                await db.collection('dates').doc(id).update(dateData);
            } else {
                dateData.createdAt = new Date().toISOString();
                await db.collection('dates').add(dateData);
            }
        } else {
            // Local storage fallback
            if (id) {
                const index = dates.findIndex(d => d.id === id);
                if (index !== -1) dates[index] = { ...dates[index], ...dateData };
            } else {
                dateData.id = 'local_' + Date.now();
                dateData.createdAt = new Date().toISOString();
                dates.unshift(dateData);
            }
            saveToLocalStorage();
            renderDates();
            updateDateSelectorList();
        }

    } catch (error) {
        console.error("Error saving date:", error);
        alert("Failed to save. Please try again.");
    } finally {
        closeModal('dateModal');
    }
}

async function handleRecipeSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('recipeId').value;
    const ingredientsText = document.getElementById('recipeIngredients').value;

    const recipeData = {
        name: document.getElementById('recipeName').value.trim(),
        time: document.getElementById('recipeTime').value.trim(),
        servings: document.getElementById('recipeServings').value.trim(),
        ingredients: ingredientsText.split('\n').map(i => i.trim()).filter(i => i),
        instructions: document.getElementById('recipeInstructions').value.trim(),
        link: document.getElementById('recipeLink').value.trim(),
        updatedAt: new Date().toISOString()
    };

    try {
        updateSyncStatus('syncing');

        if (db) {
            if (id) {
                await db.collection('recipes').doc(id).update(recipeData);
            } else {
                recipeData.createdAt = new Date().toISOString();
                await db.collection('recipes').add(recipeData);
            }
        } else {
            // Local storage fallback
            if (id) {
                const index = recipes.findIndex(r => r.id === id);
                if (index !== -1) recipes[index] = { ...recipes[index], ...recipeData };
            } else {
                recipeData.id = 'local_' + Date.now();
                recipeData.createdAt = new Date().toISOString();
                recipes.unshift(recipeData);
            }
            saveToLocalStorage();
            renderRecipes();
        }

    } catch (error) {
        console.error("Error saving recipe:", error);
        alert("Failed to save. Please try again.");
    } finally {
        closeModal('recipeModal');
    }
}

async function handlePlanSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('planId').value;
    const selectedDateIds = Array.from(document.querySelectorAll('#dateSelectorList input:checked')).map(cb => cb.value);
    const selectedRecipeIds = Array.from(document.querySelectorAll('#recipeSelectorList input:checked')).map(cb => cb.value);
    const title = document.getElementById('planTitle').value.trim();

    const planData = {
        date: document.getElementById('planDate').value,
        time: document.getElementById('planTime').value,
        title: title,
        dateIds: selectedDateIds,
        recipeIds: selectedRecipeIds,
        notes: document.getElementById('planNotes').value.trim(),
        updatedAt: new Date().toISOString()
    };

    try {
        updateSyncStatus('syncing');

        if (db) {
            if (id) {
                await db.collection('plans').doc(id).update(planData);
            } else {
                planData.createdAt = new Date().toISOString();
                await db.collection('plans').add(planData);
            }
        } else {
            // Local storage fallback
            if (id) {
                const index = plans.findIndex(p => p.id === id);
                if (index !== -1) plans[index] = { ...plans[index], ...planData };
            } else {
                planData.id = 'local_' + Date.now();
                planData.createdAt = new Date().toISOString();
                plans.push(planData);
            }
            plans.sort((a, b) => (a.date || 'z').localeCompare(b.date || 'z'));
            saveToLocalStorage();
            renderPlans();
        }

    } catch (error) {
        console.error("Error saving plan:", error);
        alert("Failed to save. Please try again.");
    } finally {
        closeModal('planModal');
    }
}

// ==========================================
// DELETE HANDLING
// ==========================================
let pendingDelete = null;

function confirmDelete(type, id, name) {
    pendingDelete = { type, id };
    document.getElementById('confirmMessage').textContent = `Are you sure you want to delete "${name}"?`;
    openModal('confirmModal');
}

async function handleConfirmDelete() {
    if (!pendingDelete) return;

    const { type, id } = pendingDelete;

    try {
        updateSyncStatus('syncing');

        if (db) {
            await db.collection(type).doc(id).delete();
        } else {
            if (type === 'dates') {
                dates = dates.filter(d => d.id !== id);
                renderDates();
            } else if (type === 'recipes') {
                recipes = recipes.filter(r => r.id !== id);
                renderRecipes();
            } else if (type === 'plans') {
                plans = plans.filter(p => p.id !== id);
                renderPlans();
            }
            saveToLocalStorage();
        }

    } catch (error) {
        console.error("Error deleting:", error);
        alert("Failed to delete. Please try again.");
    } finally {
        closeModal('confirmModal');
        pendingDelete = null;
    }
}

// ==========================================
// RENDERING
// ==========================================
function renderAll() {
    renderDates();
    renderRecipes();
    renderPlans();
}

function renderDates() {
    const container = document.getElementById('datesContainer');

    if (dates.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No date ideas yet!</p>
                <small>Tap the + button to add your first one</small>
            </div>
        `;
        return;
    }

    container.innerHTML = dates.map(date => {
        const mapsLink = getMapsLink(date.address || date.location);

        return `
            <div class="date-card" data-tags="${(date.tags || []).join(',')}">
                <div class="date-card-header">
                    <div>
                        <h3>${escapeHtml(date.name)}</h3>
                        ${date.location ? `
                            <a href="${mapsLink}" target="_blank" class="date-location">
                                📍 ${escapeHtml(date.location)}
                            </a>
                        ` : ''}
                    </div>
                    <div class="card-actions">
                        <button class="card-action-btn" onclick="openDateModal(${JSON.stringify(date).replace(/"/g, '&quot;')})">✏️</button>
                        <button class="card-action-btn" onclick="confirmDelete('dates', '${date.id}', '${escapeHtml(date.name)}')">🗑️</button>
                    </div>
                </div>
                ${date.notes ? `<p class="date-notes">${escapeHtml(date.notes)}</p>` : ''}
                ${date.tags && date.tags.length > 0 ? `
                    <div class="date-tags">
                        ${date.tags.map(tag => `<span class="tag ${tag}">${tag}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderRecipes() {
    const container = document.getElementById('recipesContainer');

    if (recipes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No recipes yet!</p>
                <small>Tap the + button to add your first one</small>
            </div>
        `;
        return;
    }

    container.innerHTML = recipes.map(recipe => `
        <div class="recipe-card">
            <div class="recipe-card-header">
                <h3>${escapeHtml(recipe.name)}</h3>
                <div class="card-actions">
                    <button class="card-action-btn" onclick="openRecipeModal(${JSON.stringify(recipe).replace(/"/g, '&quot;')})">✏️</button>
                    <button class="card-action-btn" onclick="confirmDelete('recipes', '${recipe.id}', '${escapeHtml(recipe.name)}')">🗑️</button>
                </div>
            </div>
            <div class="recipe-meta">
                ${recipe.time ? `<span>⏱️ ${escapeHtml(recipe.time)}</span>` : ''}
                ${recipe.servings ? `<span>👥 ${escapeHtml(recipe.servings)} servings</span>` : ''}
            </div>
            ${recipe.ingredients && recipe.ingredients.length > 0 ? `
                <div class="recipe-ingredients">
                    <h4>Ingredients (${recipe.ingredients.length})</h4>
                    <ul>
                        ${recipe.ingredients.map(ing => `<li>${escapeHtml(ing)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            ${recipe.instructions ? `
                <div class="recipe-instructions">${escapeHtml(recipe.instructions)}</div>
            ` : ''}
            ${recipe.link ? `
                <a href="${recipe.link}" target="_blank" class="recipe-link">🔗 View full recipe</a>
            ` : ''}
        </div>
    `).join('');
}

function renderPlans() {
    const container = document.getElementById('plansContainer');

    // Filter out past plans, but keep plans without dates
    const today = new Date().toISOString().split('T')[0];
    const upcomingPlans = plans.filter(p => !p.date || p.date >= today);

    if (upcomingPlans.length === 0) {
        container.innerHTML = `
            <div class="empty-plans">
                <p>No upcoming plans yet!</p>
                <small>Add a date from your ideas</small>
            </div>
        `;
        return;
    }

    container.innerHTML = upcomingPlans.map(plan => {
        // Get full date and recipe objects
        const planDates = (plan.dateIds || [])
            .map(id => dates.find(d => d.id === id))
            .filter(d => d);

        const planRecipes = (plan.recipeIds || [])
            .map(id => recipes.find(r => r.id === id))
            .filter(r => r);

        const formattedDate = plan.date ? formatDate(plan.date) : 'TBD';
        const timeStr = plan.time ? ` at ${formatTime(plan.time)}` : '';

        return `
            <div class="plan-card" onclick="togglePlanExpand(this, event)">
                <div class="plan-actions">
                    <button class="plan-action-btn" onclick="openPlanModalForEdit(${JSON.stringify(plan).replace(/"/g, '&quot;')})">✏️</button>
                    <button class="plan-action-btn" onclick="confirmDelete('plans', '${plan.id}', 'this plan')">🗑️</button>
                </div>
                ${plan.title ? `<div class="plan-title">${escapeHtml(plan.title)}</div>` : ''}
                <div class="plan-date">
                    📅 ${formattedDate}${timeStr}
                </div>
                ${planDates.length > 0 ? `
                    <div class="plan-items plan-summary">
                        ${planDates.map(d => `<span class="plan-item">📍 ${escapeHtml(d.name)}</span>`).join('')}
                    </div>
                ` : ''}
                ${planRecipes.length > 0 ? `
                    <div class="plan-items plan-summary">
                        ${planRecipes.map(r => `<span class="plan-item recipe-item">🍳 ${escapeHtml(r.name)}</span>`).join('')}
                    </div>
                ` : ''}
                ${plan.notes ? `<p class="plan-notes">${escapeHtml(plan.notes)}</p>` : ''}
                <div class="plan-expand-hint">Tap to see details ▼</div>

                <!-- Expanded Details -->
                <div class="plan-details">
                    ${planDates.length > 0 ? `
                        <div class="plan-detail-section">
                            <h4>Date Ideas</h4>
                            ${planDates.map(d => `
                                <div class="plan-detail-card">
                                    <strong>${escapeHtml(d.name)}</strong>
                                    ${d.location ? `
                                        <a href="${getMapsLink(d.address || d.location)}" target="_blank" class="plan-detail-link" onclick="event.stopPropagation()">
                                            📍 ${escapeHtml(d.location)}
                                        </a>
                                    ` : ''}
                                    ${d.notes ? `<p class="plan-detail-notes">${escapeHtml(d.notes)}</p>` : ''}
                                    ${d.tags && d.tags.length > 0 ? `
                                        <div class="plan-detail-tags">
                                            ${d.tags.map(tag => `<span class="tag ${tag}">${tag}</span>`).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    ${planRecipes.length > 0 ? `
                        <div class="plan-detail-section">
                            <h4>Recipes</h4>
                            ${planRecipes.map(r => `
                                <div class="plan-detail-card recipe-detail">
                                    <strong>${escapeHtml(r.name)}</strong>
                                    <div class="recipe-meta-small">
                                        ${r.time ? `<span>⏱️ ${escapeHtml(r.time)}</span>` : ''}
                                        ${r.servings ? `<span>👥 ${escapeHtml(r.servings)}</span>` : ''}
                                    </div>
                                    ${r.ingredients && r.ingredients.length > 0 ? `
                                        <div class="plan-recipe-ingredients">
                                            <span class="ingredients-label">Ingredients:</span>
                                            ${r.ingredients.slice(0, 5).map(ing => `<span class="ingredient-chip">${escapeHtml(ing)}</span>`).join('')}
                                            ${r.ingredients.length > 5 ? `<span class="ingredient-chip">+${r.ingredients.length - 5} more</span>` : ''}
                                        </div>
                                    ` : ''}
                                    ${r.link ? `
                                        <a href="${r.link}" target="_blank" class="plan-detail-link" onclick="event.stopPropagation()">
                                            🔗 View full recipe
                                        </a>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function togglePlanExpand(card, event) {
    // Don't toggle if clicking on buttons or links
    if (event.target.closest('.plan-actions') || event.target.closest('a')) {
        return;
    }
    card.classList.toggle('expanded');
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getMapsLink(address) {
    if (!address) return '#';
    // If it's already a URL, return it
    if (address.startsWith('http')) return address;
    // Otherwise, create a Google Maps search link
    return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`;
}

function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatTime(timeStr) {
    const [hours, minutes] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ==========================================
// SERVICE WORKER
// ==========================================
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker error:', err));
    }
}

// Make functions globally available
window.openDateModal = openDateModal;
window.openRecipeModal = openRecipeModal;
window.openPlanModalForEdit = openPlanModalForEdit;
window.togglePlanExpand = togglePlanExpand;
window.confirmDelete = confirmDelete;
