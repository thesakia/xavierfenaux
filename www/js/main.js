document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const mobileToggle = document.querySelector('.mobile-toggle');
    const navLinks = document.querySelector('.nav-links');
    const mobileIcon = mobileToggle?.querySelector('i');

    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            if (mobileIcon) {
                if (navLinks.classList.contains('active')) {
                    mobileIcon.classList.remove('fa-bars');
                    mobileIcon.classList.add('fa-times');
                } else {
                    mobileIcon.classList.remove('fa-times');
                    mobileIcon.classList.add('fa-bars');
                }
            }
        });
        
        // Close menu when clicking on a link
        const navLinksItems = navLinks.querySelectorAll('a');
        navLinksItems.forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                if (mobileIcon) {
                    mobileIcon.classList.remove('fa-times');
                    mobileIcon.classList.add('fa-bars');
                }
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navLinks.contains(e.target) && !mobileToggle.contains(e.target)) {
                navLinks.classList.remove('active');
                if (mobileIcon) {
                    mobileIcon.classList.remove('fa-times');
                    mobileIcon.classList.add('fa-bars');
                }
            }
        });
    }

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle?.querySelector('i');
    const applyThemeIcon = () => {
        const isDark = document.documentElement.dataset.theme === 'dark';
        if (!themeIcon) return;
        themeIcon.classList.toggle('fa-sun', isDark);
        themeIcon.classList.toggle('fa-moon', !isDark);
    };

    applyThemeIcon();

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = nextTheme;
            localStorage.setItem('theme', nextTheme);
            applyThemeIcon();
        });
    }

    // Morning Mood interview modal
    const morningMoodModal = document.getElementById('morning-mood-modal');
    const openMorningMoodModal = () => {
        if (!morningMoodModal) return;
        morningMoodModal.classList.add('is-open');
        morningMoodModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    };
    const closeMorningMoodModal = () => {
        if (!morningMoodModal) return;
        morningMoodModal.classList.remove('is-open');
        morningMoodModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
    };

    document.querySelectorAll('[data-modal-open="morning-mood-modal"]').forEach((trigger) => {
        trigger.addEventListener('click', openMorningMoodModal);
    });

    if (morningMoodModal) {
        morningMoodModal.querySelectorAll('[data-modal-close]').forEach((trigger) => {
            trigger.addEventListener('click', closeMorningMoodModal);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && morningMoodModal.classList.contains('is-open')) {
                closeMorningMoodModal();
            }
        });
    }

    const trackUmamiEvent = (eventName, data) => {
        let attempts = 0;
        const send = () => {
            attempts += 1;
            if (window.umami && typeof window.umami.track === 'function') {
                window.umami.track(eventName, data);
                return;
            }

            if (attempts < 20) {
                window.setTimeout(send, 250);
            }
        };

        send();
    };

    // Morning Mood interview form status
    const formStatus = document.getElementById('morning-mood-form-status');
    if (formStatus) {
        const params = new URLSearchParams(window.location.search);
        const status = params.get('morningmood');
        const trackingId = params.get('mmid') || '';
        const messages = {
            ok: {
                type: 'success',
                text: 'Demande envoyée. Je reviens vers toi après validation des créneaux.'
            },
            missing: {
                type: 'error',
                text: 'Il manque une information obligatoire. Vérifie ton email, tes créneaux et la description.'
            },
            error: {
                type: 'error',
                text: 'L’envoi n’a pas abouti. Réessaie dans quelques instants.'
            }
        };

        if (status && messages[status]) {
            formStatus.hidden = false;
            formStatus.textContent = messages[status].text;
            formStatus.classList.add(messages[status].type);
            openMorningMoodModal();

            if (status === 'ok' && trackingId) {
                const storageKey = `umami:morning_mood_email_sent:${trackingId}`;
                if (sessionStorage.getItem(storageKey) !== '1') {
                    sessionStorage.setItem(storageKey, '1');
                    trackUmamiEvent('morning_mood_email_sent', {
                        event_category: 'form',
                        form_name: 'morning_mood_participation',
                        status: 'sent',
                        page_path: window.location.pathname
                    });
                }
            }
        }
    }

    // Scroll Animations (Intersection Observer)
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);


    // Select elements to animate
    const animatedElements = document.querySelectorAll('.card, .section-title, .timeline-item, .hero-proof-strip, .reference-logo-card');
    animatedElements.forEach(el => {
        el.classList.add('reveal');
        observer.observe(el);
    });

    // Hero Glitch Randomizer
    const glitch = document.querySelector('.glitch');
    if (glitch) {
        setInterval(() => {
            if(Math.random() > 0.9) {
                glitch.style.textShadow = '2px 0 var(--danger), -2px 0 var(--accent-secondary)';
                setTimeout(() => {
                    glitch.style.textShadow = '-1px 0 var(--danger), -2px 0 var(--accent-secondary)';
                }, 100);
            }
        }, 2000);
    }

    // --- Neon Candlestick Chart Background (Animated) ---
    const chartCanvas = document.getElementById('hero-chart');
    if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');
        let animationId;
        let candles = [];
        let time = 0;
        
        const resizeChart = () => {
            chartCanvas.width = chartCanvas.parentElement.offsetWidth;
            chartCanvas.height = chartCanvas.parentElement.offsetHeight;
            initCandles();
        };
        
        const getAccentColor = () => {
            return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        };
        
        const hexToRgb = (hex) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return { r, g, b };
        };
        
        function initCandles() {
            const candleCount = 20;
            candles = [];
            let basePrice = 0.5;
            
            for (let i = 0; i < candleCount; i++) {
                const volatility = 0.12; // Reduced for smaller bars
                const change = (Math.random() - 0.5) * volatility * 0.25;
                basePrice += change;
                basePrice = Math.max(0.3, Math.min(0.7, basePrice));
                
                const open = basePrice;
                // Bigger body range (open-close difference)
                const bodyRange = (Math.random() - 0.3) * volatility * 0.8; // More variation in body size
                const close = basePrice + bodyRange;
                // Smaller wicks (high-low range)
                const wickSize = Math.random() * volatility * 0.15; // Smaller wicks
                const high = Math.max(open, close) + wickSize;
                const low = Math.min(open, close) - wickSize;
                
                candles.push({ 
                    open, 
                    close, 
                    high, 
                    low,
                    targetOpen: open,
                    targetClose: close,
                    targetHigh: high,
                    targetLow: low
                });
            }
        }
        
        function updateCandles() {
            // Slowly update candles with smooth transitions (50% slower)
            time += 0.0025; // 50% slower: was 0.005, now 0.0025
            
            candles.forEach((candle, i) => {
                // Smoothly interpolate towards new targets (50% slower)
                const lerp = (start, end, t) => start + (end - start) * t;
                const t = 0.01; // 50% slower interpolation: was 0.02, now 0.01
                
                candle.open = lerp(candle.open, candle.targetOpen, t);
                candle.close = lerp(candle.close, candle.targetClose, t);
                candle.high = lerp(candle.high, candle.targetHigh, t);
                candle.low = lerp(candle.low, candle.targetLow, t);
                
                // Occasionally update targets for slow movement (less frequent)
                if (Math.random() < 0.005) { // Less frequent updates for slower movement
                    const volatility = 0.12; // Reduced for smaller bars
                    const change = (Math.random() - 0.5) * volatility * 0.2;
                    const newBase = (candle.open + candle.close) / 2 + change;
                    
                    candle.targetOpen = Math.max(0.3, Math.min(0.7, newBase));
                    // Bigger body range variation
                    const bodyRange = (Math.random() - 0.3) * volatility * 0.7;
                    candle.targetClose = candle.targetOpen + bodyRange;
                    // Smaller wicks
                    const wickSize = Math.random() * volatility * 0.12;
                    candle.targetHigh = Math.max(candle.targetOpen, candle.targetClose) + wickSize;
                    candle.targetLow = Math.min(candle.targetOpen, candle.targetClose) - wickSize;
                }
            });
        }
        
        function drawChart(scrollOffset = 0) {
            // Clear canvas completely (no trail)
            ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
            
            const accentColor = getAccentColor();
            const rgb = hexToRgb(accentColor);
            
            // Neon colors with glow (filled)
            const neonBullish = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
            const neonBullishGlow = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
            const neonBearish = 'rgba(255, 255, 255, 0.8)';
            const neonBearishGlow = 'rgba(255, 255, 255, 0.3)';
            
            const padding = 60;
            const chartWidth = chartCanvas.width - padding * 2;
            const chartHeight = chartCanvas.height - padding * 2;
            const candleCount = candles.length;
            const candleWidth = chartWidth / candleCount * 0.6;
            const candleSpacing = chartWidth / candleCount;
            
            // Parallax offset - moves chart based on scroll
            const parallaxX = scrollOffset * 0.3;
            
            // Draw candlesticks with neon glow (outline only)
            candles.forEach((candle, i) => {
                const x = padding + i * candleSpacing + candleSpacing * 0.2 + parallaxX;
                const isBullish = candle.close > candle.open;
                
                const bodyTop = Math.min(candle.open, candle.close);
                const bodyBottom = Math.max(candle.open, candle.close);
                const bodyHeight = bodyBottom - bodyTop;
                const bodyY = padding + bodyTop * chartHeight;
                const wickX = x + candleWidth / 2;
                const wickTop = padding + candle.high * chartHeight;
                const wickBottom = padding + candle.low * chartHeight;
                
                // Draw wick with neon glow (filled)
                ctx.shadowBlur = 8;
                ctx.shadowColor = isBullish ? neonBullishGlow : neonBearishGlow;
                ctx.strokeStyle = isBullish ? neonBullish : neonBearish;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(wickX, wickTop);
                ctx.lineTo(wickX, wickBottom);
                ctx.stroke();
                
                // Draw body filled (solid)
                if (bodyHeight > 0.01) {
                    const bodyRectHeight = bodyHeight * chartHeight;
                    
                    // Outer glow for filled body
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = isBullish ? neonBullishGlow : neonBearishGlow;
                    ctx.fillStyle = isBullish ? neonBullish : neonBearish;
                    ctx.fillRect(x, bodyY, candleWidth, bodyRectHeight);
                    
                    // Bright core for depth
                    ctx.shadowBlur = 0;
                    const coreOpacity = isBullish ? 1 : 0.95;
                    const r = isBullish ? rgb.r : 255;
                    const g = isBullish ? rgb.g : 255;
                    const b = isBullish ? rgb.b : 255;
                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${coreOpacity})`;
                    ctx.fillRect(x + 1, bodyY + 1, candleWidth - 2, bodyRectHeight - 2);
                    
                    // Subtle border
                    ctx.shadowBlur = 5;
                    ctx.strokeStyle = isBullish ? neonBullish : neonBearish;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, bodyY, candleWidth, bodyRectHeight);
                } else {
                    // Doji with glow (horizontal line, filled)
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = isBullish ? neonBullishGlow : neonBearishGlow;
                    ctx.strokeStyle = isBullish ? neonBullish : neonBearish;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(x, bodyY);
                    ctx.lineTo(x + candleWidth, bodyY);
                    ctx.stroke();
                }
                
                ctx.shadowBlur = 0;
            });
        }
        
        let scrollY = 0;
        let targetScrollY = 0;
        
        // Parallax scroll handler
        function handleScroll() {
            targetScrollY = window.scrollY || window.pageYOffset;
        }
        
        function animate() {
            updateCandles();
            
            // Smooth scroll interpolation for parallax
            scrollY += (targetScrollY - scrollY) * 0.1;
            drawChart(scrollY);
            
            animationId = requestAnimationFrame(animate);
        }
        
        window.addEventListener('scroll', handleScroll, { passive: true });
        
        window.addEventListener('resize', () => {
            resizeChart();
        });
        
        window.addEventListener('orientationchange', () => {
            setTimeout(resizeChart, 100);
        });
        
        // Redraw on color change
        const colorObserver = new MutationObserver(() => {
            // Chart will update on next frame
        });
        colorObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style']
        });
        
        resizeChart();
        animate();
    }

    // --- Floating Particles Constellation Effect ---
    const canvas = document.getElementById('hero-particles');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        let animationId;
        let resizeTimeout;

        const resizeCanvas = () => {
            const heroSection = canvas.parentElement;
            canvas.width = heroSection.offsetWidth || window.innerWidth;
            canvas.height = heroSection.offsetHeight || window.innerHeight;
            // Reinitialize particles after resize
            if (particles.length > 0) {
                initParticles();
            }
        };
        
        // Debounced resize handler for better performance
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                resizeCanvas();
            }, 150);
        };
        
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', () => {
            setTimeout(resizeCanvas, 100);
        });
        
        // Initial resize
        resizeCanvas();

        // Store accent color for particles - get from CSS or localStorage
        const getAccentColor = () => {
            return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        };
        
        let currentAccentColor = getAccentColor();
        
        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 0.1; // 2x slower
                this.vy = (Math.random() - 0.5) * 0.1; // 2x slower
                this.size = Math.random() * 0.8 + 0.5; // Much smaller: 0.5 to 1.3 pixels
                this.isAccent = Math.random() > 0.8;
                this.updateColor();
            }
            
            updateColor() {
                this.color = this.isAccent ? currentAccentColor : 'rgba(255, 255, 255, 0.4)';
            }

            update() {
                // More floaty movement with slight drift (slower)
                this.vx += (Math.random() - 0.5) * 0.015; // 2x slower
                this.vy += (Math.random() - 0.5) * 0.015; // 2x slower
                
                // Limit velocity for smoother movement (reduced max speed)
                this.vx = Math.max(-0.25, Math.min(0.25, this.vx));
                this.vy = Math.max(-0.25, Math.min(0.25, this.vy));
                
                this.x += this.vx;
                this.y += this.vy;

                // Wrap around edges instead of bouncing
                if (this.x < 0) this.x = canvas.width;
                if (this.x > canvas.width) this.x = 0;
                if (this.y < 0) this.y = canvas.height;
                if (this.y > canvas.height) this.y = 0;
            }

            draw() {
                // Very subtle bloom with small gradient
                const gradient = ctx.createRadialGradient(
                    this.x, this.y, 0,
                    this.x, this.y, this.size * 3
                );
                
                if (this.isAccent) {
                    // Convert hex to rgba for gradient
                    const r = parseInt(this.color.slice(1, 3), 16);
                    const g = parseInt(this.color.slice(3, 5), 16);
                    const b = parseInt(this.color.slice(5, 7), 16);
                    
                    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.6)`);
                    gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.2)`);
                    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
                } else {
                    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
                    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.1)');
                    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                }
                
                // Draw subtle bloom
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();
                
                // Draw small core
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
            }
        }

        function initParticles() {
            particles = [];
            // More particles since they're smaller now
            const isMobile = window.innerWidth < 768;
            const density = isMobile ? 10000 : 8000;
            const numberOfParticles = Math.max(30, Math.floor((canvas.width * canvas.height) / density));
            for (let i = 0; i < numberOfParticles; i++) {
                particles.push(new Particle());
            }
        }
        
        // Function to update all particles with new accent color
        function updateParticlesColor() {
            currentAccentColor = getAccentColor();
            particles.forEach(particle => {
                if (particle.isAccent) {
                    particle.updateColor();
                }
            });
        }

        function animateParticles() {
            // Clear canvas completely for crisp particles
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw particles with bloom
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();
            }
            
            animationId = requestAnimationFrame(animateParticles);
        }

        initParticles();
        animateParticles();
        
        // Make updateParticlesColor globally accessible
        window.updateParticlesColor = updateParticlesColor;
    }
    
    // Color Picker Handler
    const colorPicker = document.getElementById('accent-color-picker');
    if (colorPicker) {
        // Load saved color from localStorage
        const savedColor = localStorage.getItem('accentColor');
        if (savedColor) {
            colorPicker.value = savedColor;
            document.documentElement.style.setProperty('--accent', savedColor);
            // Update particles if they exist
            if (window.updateParticlesColor) {
                setTimeout(() => window.updateParticlesColor(), 100);
            }
        }
        
        // Update color on change
        colorPicker.addEventListener('input', (e) => {
            const newColor = e.target.value;
            document.documentElement.style.setProperty('--accent', newColor);
            localStorage.setItem('accentColor', newColor);
            
            // Update particles if they exist
            if (window.updateParticlesColor) {
                window.updateParticlesColor();
            }
        });
    }
	
const socialBar = document.querySelector('.hero-socials');

let isDragging = false;
let startX, startY;
let initialTransformX = 0;
let initialTransformY = 0;

if (socialBar) {
socialBar.addEventListener('mousedown', (e) => {
    isDragging = true;
    socialBar.style.cursor = 'grabbing';
    
    // 1. On désactive la transition pour que ça suive la souris INSTANTANÉMENT
    socialBar.style.transition = 'none';

    // 2. On calcule le point de départ exact
    // On récupère la valeur actuelle du transform (s'il a déjà bougé)
    const style = window.getComputedStyle(socialBar);
    const matrix = new WebKitCSSMatrix(style.transform);
    
    // La position actuelle de la barre (X et Y)
    initialTransformX = matrix.m41;
    initialTransformY = matrix.m42;

    // Le point de référence (Où j'ai cliqué - Où est la barre)
    startX = e.clientX - initialTransformX;
    startY = e.clientY - initialTransformY;
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    e.preventDefault(); // Empêche de sélectionner du texte pendant qu'on tire

    // 3. On calcule la nouvelle position
    const currentX = e.clientX - startX;
    const currentY = e.clientY - startY;

    // 4. On applique
    socialBar.style.transform = `translate(${currentX}px, ${currentY}px)`;
});

document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    socialBar.style.cursor = 'grab';
    
    // 5. On remet la transition douce pour l'effet "box-shadow" ou si tu veux qu'elle revienne à sa place
    socialBar.style.transition = 'transform 0.1s, box-shadow 0.3s';
});
}
	

});

