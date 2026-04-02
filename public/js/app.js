// app.js — Entry point

import { checkAuth, showLoginScreen, showApp } from './auth.js';
import { loadTrucks, renderSidebar } from './sidebar.js';
import { renderMain } from './dashboard.js';
import { state, setSelectedTruck } from './state.js';
import './modals.js';
import './trucks.modal.js';
import './trips.modal.js';
import './trips.js';

async function init() {
  const isAuth = await checkAuth();
  if (!isAuth) {
    showLoginScreen();
    return;
  }
  showApp();
  await loadTrucks();
  if (state.trucks.length) {
    setSelectedTruck(state.trucks[0].id);
    renderSidebar();
    await renderMain();
  }
}

window.addEventListener('authenticated', async () => {
  await loadTrucks();
  if (state.trucks.length) {
    setSelectedTruck(state.trucks[0].id);
    renderSidebar();
    await renderMain();
  }
});

init();
