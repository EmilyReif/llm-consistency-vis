/**
 * Shared 5-minute count-down circular progress timer for user study landing pages.
 * Only visible on task pages. Resets when user hits Next.
 * Usage: LandingPageTimer.init(); then call setVisible(), reset() from landing page.
 */
(function() {
  'use strict';

  const TOTAL_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  const RADIUS = 36;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const YELLOW_THRESHOLD_MS = 2 * 60 * 1000; // Yellow when <= 2 min remaining

  function formatTime(ms) {
    const clamped = Math.max(0, ms);
    const totalSeconds = Math.floor(clamped / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function getColorState(remainingMs) {
    if (remainingMs <= 0) return 'red';
    if (remainingMs <= YELLOW_THRESHOLD_MS) return 'yellow';
    return 'green';
  }

  function getProgressFraction(remainingMs) {
    return Math.min(1, Math.max(0, remainingMs / TOTAL_DURATION_MS));
  }

  let startTime = null;
  let containerEl = null;
  let intervalId = null;
  let onElapsedChangeCallback = null;

  function update() {
    if (!startTime || !containerEl) return;
    const elapsed = Date.now() - startTime;
    const remaining = TOTAL_DURATION_MS - elapsed;
    const color = getColorState(remaining);
    const fraction = getProgressFraction(remaining);
    const timeStr = formatTime(remaining);
    const isOvertime = remaining <= 0;

    // Update time display
    const timeEl = containerEl.querySelector('.timer-time');
    if (timeEl) timeEl.textContent = timeStr;

    // Update progress circle: fraction = remaining/total, so full circle at start, empty at 0
    const circle = containerEl.querySelector('.timer-progress-circle');
    if (circle) {
      const offset = CIRCUMFERENCE * (1 - fraction);
      circle.style.strokeDashoffset = offset;
      circle.setAttribute('stroke', color === 'green' ? '#4caf50' : color === 'yellow' ? '#f9a825' : '#d32f2f');
    }

    // Update track (background circle) color
    const track = containerEl.querySelector('.timer-track');
    if (track) {
      track.setAttribute('stroke', color === 'green' ? '#c8e6c9' : color === 'yellow' ? '#fff9c4' : '#ffcdd2');
    }

    // Show/hide overtime message
    const msgEl = containerEl.querySelector('.timer-overtime-msg');
    if (msgEl) {
      msgEl.style.display = isOvertime ? 'block' : 'none';
    }

    // Update container class for color state
    containerEl.classList.remove('timer-green', 'timer-yellow', 'timer-red');
    containerEl.classList.add(color === 'green' ? 'timer-green' : color === 'yellow' ? 'timer-yellow' : 'timer-red');

    if (onElapsedChangeCallback) {
      onElapsedChangeCallback(elapsed);
    }
  }

  function injectStyles() {
    if (document.getElementById('landing-page-timer-styles')) return;
    const style = document.createElement('style');
    style.id = 'landing-page-timer-styles';
    style.textContent = [
      '.landing-page-timer { position: fixed; top: 20px; right: 20px; z-index: 9999; }',
      '.landing-page-timer.timer-hidden { display: none !important; }',
      '.landing-page-timer .timer-content { display: flex; flex-direction: column; align-items: center; gap: 8px; }',
      '.landing-page-timer .timer-circle-wrap { position: relative; background: white; border-radius: 50%; padding: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }',
      '.landing-page-timer .timer-svg { display: block; }',
      '.landing-page-timer .timer-inner { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }',
      '.landing-page-timer .timer-time { font-size: 14px; font-weight: 600; color: #333; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
      '.landing-page-timer .timer-overtime-msg { font-size: 11px; color: #333; text-align: center; max-width: 140px; line-height: 1.2; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }'
    ].join(' ');
    document.head.appendChild(style);
  }

  function createTimerDOM() {
    injectStyles();
    const div = document.createElement('div');
    div.className = 'landing-page-timer timer-green';
    div.innerHTML = 
      '<div class="timer-content">' +
        '<div class="timer-circle-wrap">' +
          '<svg class="timer-svg" viewBox="0 0 80 80" width="80" height="80">' +
            '<circle class="timer-track" cx="40" cy="40" r="' + RADIUS + '" fill="none" stroke-width="6" stroke="#c8e6c9" />' +
            '<circle class="timer-progress-circle" cx="40" cy="40" r="' + RADIUS + '" fill="none" stroke-width="6" stroke="#4caf50" stroke-linecap="round" transform="rotate(-90 40 40)" stroke-dasharray="' + CIRCUMFERENCE + '" stroke-dashoffset="' + CIRCUMFERENCE + '" />' +
          '</svg>' +
          '<div class="timer-inner">' +
            '<span class="timer-time">00:00</span>' +
          '</div>' +
        '</div>' +
        '<div class="timer-overtime-msg" style="display: none;">Please move to the next task as soon as possible.</div>' +
      '</div>';
    return div;
  }

  window.LandingPageTimer = {
    init: function(options) {
      options = options || {};
      onElapsedChangeCallback = options.onElapsedChange || null;
      startTime = Date.now();

      containerEl = createTimerDOM();
      containerEl.classList.add('timer-hidden');
      document.body.appendChild(containerEl);

      update();
      intervalId = setInterval(update, 1000);
    },

    show: function() {
      if (containerEl) containerEl.classList.remove('timer-hidden');
    },

    hide: function() {
      if (containerEl) containerEl.classList.add('timer-hidden');
    },

    setVisible: function(visible) {
      if (visible) {
        this.show();
      } else {
        this.hide();
      }
    },

    reset: function() {
      startTime = Date.now();
      update();
    },

    getElapsedMs: function() {
      return startTime ? Date.now() - startTime : 0;
    },

    getRemainingMs: function() {
      return startTime ? Math.max(0, TOTAL_DURATION_MS - (Date.now() - startTime)) : TOTAL_DURATION_MS;
    },

    getStartTime: function() {
      return startTime;
    },

    TOTAL_DURATION_MS: TOTAL_DURATION_MS
  };
})();
