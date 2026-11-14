/**
 * StrydeGoSox — Pocket Socks
 * Main JavaScript
 * ----------------------------------------
 * Handles page loading, navigation, interactions,
 * animations, counters, product interactions and UI feedback.
 */
(function(){

  /* ---------- PRELOADER ---------- */
  const preloader = document.getElementById('preloader');
  const preBarFill = document.getElementById('preBarFill');
  const prePct = document.getElementById('prePct');
  let pct = 0;
  const preTimer = setInterval(() => {
    pct += Math.random()*18 + 6;
    if(pct >= 100){ pct = 100; clearInterval(preTimer); }
    preBarFill.style.width = pct + '%';
    prePct.textContent = 'Loading ' + Math.floor(pct) + '%';
    if(pct === 100){
      setTimeout(() => {
        preloader.classList.add('hide');
        document.body.classList.remove('loading');
      }, 280);
    }
  }, 140);
  // safety fallback in case interval logic stalls
  setTimeout(() => {
    preloader.classList.add('hide');
    document.body.classList.remove('loading');
  }, 2600);

  /* ---------- HEADER ON SCROLL + PROGRESS BAR ---------- */
  const header = document.getElementById('siteHeader');
  const progress = document.getElementById('scrollProgress');
  function onScroll(){
    header.classList.toggle('scrolled', window.scrollY > 40);
    const h = document.documentElement;
    const scrolled = (h.scrollTop) / (h.scrollHeight - h.clientHeight) * 100;
    progress.style.width = scrolled + '%';
  }
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();

  /* ---------- CUSTOM CURSOR ---------- */
  const isFinePointer = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if(isFinePointer){
    document.documentElement.classList.add('has-cursor');
    const dot = document.getElementById('cursorDot');
    const ring = document.getElementById('cursorRing');
    let mx=innerWidth/2, my=innerHeight/2, rx=mx, ry=my;
    window.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.left = mx+'px'; dot.style.top = my+'px';
    });
    function ringLoop(){
      rx += (mx-rx)*0.18; ry += (my-ry)*0.18;
      ring.style.left = rx+'px'; ring.style.top = ry+'px';
      requestAnimationFrame(ringLoop);
    }
    ringLoop();
    const bigTargets = document.querySelectorAll('a, button, input[type="range"], .gallery-item, .testi-card, .puck-interactive');
    bigTargets.forEach(el => {
      el.addEventListener('mouseenter', () => {
        ring.classList.add('big');
        if(el.classList.contains('gallery-item')) ring.textContent = 'VIEW';
        else if(el.classList.contains('puck-interactive')) ring.textContent = 'OPEN';
        else ring.textContent = '';
      });
      el.addEventListener('mouseleave', () => { ring.classList.remove('big'); ring.textContent=''; });
    });

    /* magnetic buttons */
    document.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const relX = e.clientX - r.left - r.width/2;
        const relY = e.clientY - r.top - r.height/2;
        btn.style.transform = `translate(${relX*0.22}px, ${relY*0.35}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });

    /* hero parallax — move the complete tin assembly without interfering with the lid animation */
    const heroVisual = document.getElementById('heroVisual');
    const puckInteractive = document.getElementById('puckInteractive');
    const heroGlow = document.getElementById('heroGlow');
    if(heroVisual && puckInteractive){
      window.addEventListener('mousemove', (e) => {
        const nx = (e.clientX / innerWidth - 0.5);
        const ny = (e.clientY / innerHeight - 0.5);
        puckInteractive.style.setProperty('--px', `${nx * 16}px`);
        puckInteractive.style.setProperty('--py', `${ny * 12}px`);
        if(heroGlow) heroGlow.style.transform = `translate(${nx * 26}px, ${ny * 20}px)`;
      });
    }

    /* testimonial 3D tilt */
    document.querySelectorAll('.testi-card').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left)/r.width - 0.5;
        const py = (e.clientY - r.top)/r.height - 0.5;
        card.style.transform = `perspective(600px) rotateY(${px*8}deg) rotateX(${-py*8}deg) translateY(0)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform=''; });
    });
  }

  /* ---------- REVEAL ON SCROLL ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  revealEls.forEach(el => io.observe(el));

  const groupEls = document.querySelectorAll('.reveal-group, .testi-grid');
  const gio = new IntersectionObserver((entries) => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); gio.unobserve(e.target); } });
  }, { threshold: 0.1 });
  groupEls.forEach(el => gio.observe(el));

  /* ---------- SCROLLSPY ---------- */
  const navLinks = document.querySelectorAll('nav.links a');
  const spySections = Array.from(navLinks).map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const spyIo = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const id = '#' + entry.target.id;
      const link = document.querySelector(`nav.links a[href="${id}"]`);
      if(!link) return;
      if(entry.isIntersecting){
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  }, { threshold: 0.5, rootMargin: '-40% 0px -40% 0px' });
  spySections.forEach(sec => spyIo.observe(sec));

  /* ---------- COUNTERS ---------- */
  function formatNum(n, format){
    n = Math.round(n);
    if(format === 'comma') return n.toLocaleString('en-US');
    return String(n);
  }
  const counters = document.querySelectorAll('.count-num');
  const cio = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      const el = entry.target;
      cio.unobserve(el);
      const target = parseFloat(el.dataset.count || '0');
      const suffix = el.dataset.suffix || '';
      const prefix = el.dataset.prefix || '';
      const format = el.dataset.format || '';
      const dur = 1400;
      const start = performance.now();
      function tick(now){
        const p = Math.min(1, (now-start)/dur);
        const eased = 1 - Math.pow(1-p, 3);
        el.textContent = prefix + formatNum(target*eased, format) + suffix;
        if(p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  counters.forEach(el => cio.observe(el));

  /* ---------- SCROLL REVEAL SYSTEM ---------- */
  const revealElsScroll = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  revealElsScroll.forEach(el => revealObserver.observe(el));

  /* ---------- STAGGERED REVEAL GROUPS ---------- */
  const revealGroups = document.querySelectorAll('.reveal-group');
  revealGroups.forEach(group => {
    const children = group.querySelectorAll('.reveal');
    let groupObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          children.forEach((child, i) => {
            setTimeout(() => {
              child.classList.add('in');
            }, i * 100); // Stagger 100ms between children
          });
          groupObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    groupObserver.observe(group);
  });

  /* ---------- STAT REVEAL OBSERVER ---------- */
  const statEls = document.querySelectorAll('[data-stat-reveal]');
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('stat-visible');
        statObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  statEls.forEach(el => statObserver.observe(el));

  /* ---------- IMAGE SCALE/MOVEMENT ON SCROLL ---------- */
  const scrollImgs = document.querySelectorAll('[data-scroll-scale]');
  if(scrollImgs.length){
    const imgObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          const el = entry.target;
          const img = el.tagName === 'IMG' ? el : el.querySelector('img');
          if(!img) return;
          img.style.transition = 'transform 0.6s cubic-bezier(0.22,1,0.36,1), opacity 0.6s ease';
          img.style.transform = 'scale(1.06)';
          img.style.opacity = '0.85';
          setTimeout(() => {
            img.style.transform = 'scale(1)';
            img.style.opacity = '1';
          }, 120);
          imgObserver.unobserve(el);
        }
      });
    }, { threshold: 0.3 });
    scrollImgs.forEach(el => imgObserver.observe(el));
  }

  /* ---------- STRETCH LAB ---------- */
  const slider = document.getElementById('stretchSlider');
  const shape = document.getElementById('stretchShape');
  const sizeReadout = document.getElementById('sizeReadout');
  const stretchReadout = document.getElementById('stretchReadout');
  const labStage = document.getElementById('labStage');
  function updateLab(v){
    const t = v/100;
    shape.style.setProperty('--t', t);
    const cm = (8 + t*62).toFixed(0);
    sizeReadout.textContent = t < 0.08 ? 'Ø 8 CM' : cm + ' CM';
    stretchReadout.textContent = Math.round(t*100) + '%';
  }
  if (slider && shape && sizeReadout && stretchReadout) {
    slider.addEventListener('input', (e) => updateLab(e.target.value));
    updateLab(0);
  }

  let labDemoPlayed = false;
  const labIo = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(!entry.isIntersecting || labDemoPlayed) return;
      labDemoPlayed = true;
      labStage.classList.add('demo');
      const dur = 1600;
      const start = performance.now();
      function tick(now){
        const p = Math.min(1, (now-start)/dur);
        const eased = p < 0.6 ? (p/0.6) : (1 - (p-0.6)/0.4)*0.15 + 0.85 - 0.85*((p-0.6)/0.4);
        const v = p < 0.6 ? p/0.6*78 : 78 - ((p-0.6)/0.4)*78;
        slider.value = v;
        updateLab(v);
        if(p < 1){ requestAnimationFrame(tick); }
        else { labStage.classList.remove('demo'); slider.value = 0; updateLab(0); }
      }
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  if (labStage) labIo.observe(labStage);

  // Mobile: Tap to replay stretch lab demo
  if (labStage) {
    labStage.addEventListener('click', () => {
      if (!isFinePointer) { // Mobile only - desktop uses hover
        labDemoPlayed = false;
        labStage.classList.add('demo');
        const dur = 1600;
        const start = performance.now();
        function tick(now){
          const p = Math.min(1, (now-start)/dur);
          const eased = p < 0.6 ? (p/0.6) : (1 - (p-0.6)/0.4)*0.15 + 0.85 - 0.85*((p-0.6)/0.4);
          const v = p < 0.6 ? p/0.6*78 : 78 - ((p-0.6)/0.4)*78;
          slider.value = v;
          updateLab(v);
          if(p < 1){ requestAnimationFrame(tick); }
          else { labStage.classList.remove('demo'); slider.value = 0; updateLab(0); }
        }
        requestAnimationFrame(tick);
      }
    });

    // Keyboard accessibility
    labStage.addEventListener('keydown', (e) => {
      if (!isFinePointer && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        labStage.click();
      }
    });
  }

  /* ---------- GALLERY PARALLAX ---------- */
  const galleryImgs = document.querySelectorAll('.gallery-item img');
  function parallaxLoop(){
    galleryImgs.forEach(img => {
      const r = img.parentElement.getBoundingClientRect();
      const center = r.top + r.height/2 - innerHeight/2;
      const shift = Math.max(-30, Math.min(30, center * -0.04));
      img.style.transform = `translateY(${shift}px) scale(1.08)`;
    });
    document.querySelectorAll('[data-parallax]').forEach(el => {
      const speed = parseFloat(el.dataset.parallax);
      const r = el.parentElement.getBoundingClientRect();
      const shift = r.top * speed;
      el.style.transform = `translateY(${shift}px)`;
    });
    requestAnimationFrame(parallaxLoop);
  }
  requestAnimationFrame(parallaxLoop);

  /* ---------- HERO PRODUCT MOBILE AUTO-OPEN & INTERACTION ---------- */
  const heroProduct = document.getElementById('heroProduct');
  if (heroProduct) {
    // Mobile: Auto-open on viewport entry via IntersectionObserver
    let heroAutoOpened = false;
    const heroObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (heroAutoOpened) return;
        if (isFinePointer) return; // Desktop: keep hover behavior
        heroAutoOpened = true;
        heroProduct.classList.add('open');
        // Allow tap to replay/toggle after auto-open
        setTimeout(() => {
          heroAutoOpened = false; // Reset after brief delay to allow immediate tap replay
        }, 1500);
      });
    }, { threshold: 0.3 });
    heroObserver.observe(heroProduct);

    // Mobile: Tap to toggle (replaces non-existent puckInteractive click handler)
    heroProduct.addEventListener('click', () => {
      if (!isFinePointer) {
        const isOpen = heroProduct.classList.toggle('open');
        // Add revealed class for CSS transitions
        heroProduct.classList.toggle('revealed', isOpen);
        // Close when tapping outside
        if (!isOpen) {
          setTimeout(() => {
            heroProduct.classList.remove('revealed');
          }, 300);
        }
      }
    });

    // Keyboard accessibility (fallback)
    heroProduct.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!isFinePointer) {
          const isOpen = heroProduct.classList.toggle('open');
          heroProduct.classList.toggle('revealed', isOpen);
          if (!isOpen) {
            setTimeout(() => {
              heroProduct.classList.remove('revealed');
            }, 300);
          }
        }
      }
    });

    // Close when clicking outside (mobile only)
    document.addEventListener('click', (e) => {
      if (!isFinePointer && !heroProduct.contains(e.target)) {
        heroProduct.classList.remove('open', 'revealed');
      }
    });
  }

  /* ---------- QTY STEPPER ---------- */
  let qty = 1;
  const qtyVal = document.getElementById('qtyVal');
  document.getElementById('qtyPlus').addEventListener('click', () => { qty = Math.min(qty+1,9); qtyVal.textContent = qty; });
  document.getElementById('qtyMinus').addEventListener('click', () => { qty = Math.max(qty-1,1); qtyVal.textContent = qty; });

  /* ---------- ADD TO CART TOAST ---------- */
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  let toastTimer;
  document.querySelectorAll('.buy-actions .btn-primary, .buy-actions .btn-ghost').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse');
      const isBuyNow = btn.textContent.trim().toLowerCase().includes('buy now');
      toastMsg.textContent = isBuyNow ? `Heading to checkout — ${qty} pair${qty>1?'s':''}` : `Added ${qty} pair${qty>1?'s':''} to cart`;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    });
  });

  /* ---------- BARCODE ---------- */
  const bc = document.getElementById('barcode');
  let bars = '';
  for(let i=0;i<28;i++){
    const w = [1,1,2,1,3][Math.floor(Math.random()*5)];
    const h = 14 + Math.random()*16;
    bars += `<i style="width:${w}px;height:${h}px;"></i>`;
  }
  bc.innerHTML = bars;

})();

/* =========================================================
   STRYDEGOSOX — POCKET PROBLEM ANIMATION
   Robust state machine: autoplay, replay, touch and keyboard.
========================================================= */

(() => {
  const pocketSection = document.querySelector('#pocket-problem');
  if (!pocketSection) return;

  const states = [
    document.querySelector('#pocketClosed'),
    document.querySelector('#pocketOpen'),
    document.querySelector('#pocketPull'),
    document.querySelector('#pocketFull')
  ];

  const steps = Array.from(document.querySelectorAll('.stage-step'));
  const arrows = Array.from(document.querySelectorAll('.animation-arrow'));
  const productAnimation = document.querySelector('.product-animation');

  if (states.some(state => !state)) return;

  let running = false;
  let timers = [];
  let activeStage = 0;

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function showStage(index) {
    activeStage = index;

    states.forEach((state, i) => {
      state.classList.toggle('is-active', i === index);
      state.style.opacity = i === index ? '1' : '0';
      state.style.transform = i === index
        ? 'translate3d(0,0,0) scale(1)'
        : 'translate3d(34px,0,0) scale(.92)';
    });

    steps.forEach((step, i) => step.classList.toggle('active', i === index));
    arrows.forEach((arrow, i) => arrow.classList.toggle('active', i === index - 1));
  }

  function runPocketAnimation(force = false) {
    if (running && !force) return;

    clearTimers();
    running = true;

    showStage(0);

    timers.push(setTimeout(() => showStage(1), 1050));
    timers.push(setTimeout(() => showStage(2), 2400));
    timers.push(setTimeout(() => showStage(3), 3850));
    timers.push(setTimeout(() => {
      running = false;
    }, 5400));
  }

  showStage(0);

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        runPocketAnimation();
      }
    });
  }, { threshold: .28 });

  observer.observe(pocketSection);

  if (productAnimation) {
    productAnimation.addEventListener('mouseenter', () => {
      if (!running) runPocketAnimation(true);
    });

    productAnimation.addEventListener('click', () => {
      runPocketAnimation(true);
    });

    productAnimation.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        runPocketAnimation(true);
      }
    });
  }

  pocketSection.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimers();
      running = false;
    }
  });

  window.addEventListener('beforeunload', clearTimers, { once: true });
})();

/* =========================================================
   STRYDEGOSOX — MISSIONS INTERACTION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const cards =
            document.querySelectorAll(
                ".mission-card"
            );

        const grid =
            document.querySelector(
                "#missionsGrid"
            );

        const tin =
            document.querySelector(
                "#missionTin"
            );

        const redGlow =
            document.querySelector(
                ".missions-glow-red"
            );


        if (!cards.length || !tin) {
            return;
        }


        /* =================================================
           MISSION DATA
        ================================================= */

        const missionData = {

            travel: {

                rotate: "-6deg",

                scale: "1.06",

                x: "-50%",

                y: "-50%"

            },

            commute: {

                rotate: "5deg",

                scale: "1.04",

                x: "-50%",

                y: "-50%"

            },

            train: {

                rotate: "-4deg",

                scale: "1.08",

                x: "-50%",

                y: "-50%"

            },

            office: {

                rotate: "7deg",

                scale: "1.04",

                x: "-50%",

                y: "-50%"

            }

        };


        /* =================================================
           ACTIVATE CARD
        ================================================= */

        function activateCard(card) {

            cards.forEach(
                item => {

                    item.classList.remove(
                        "active"
                    );

                }
            );


            card.classList.add(
                "active"
            );


            const mission =
                card.dataset.mission;


            const data =
                missionData[mission];


            if (!data) {
                return;
            }


            /*
             * Animate product slightly
             * differently for every environment.
             */

            tin.style.transform =
                `
                translate(
                    ${data.x},
                    ${data.y}
                )
                rotate(${data.rotate})
                scale(${data.scale})
                `;


            /*
             * Move red ambient glow.
             */

            const positions = {

                travel: "translate(-40px,-30px)",

                commute: "translate(50px,-20px)",

                train: "translate(-30px,40px)",

                office: "translate(50px,45px)"

            };


            if (redGlow) {
                redGlow.style.transform =
                    positions[mission] ||
                    "translate(0,0)";
            }

        }


        /* =================================================
           MOUSE / TOUCH
        ================================================= */

        cards.forEach(
            card => {

                card.addEventListener(
                    "mouseenter",
                    () => {

                        activateCard(
                            card
                        );

                    }
                );


                card.addEventListener(
                    "focus",
                    () => {

                        activateCard(
                            card
                        );

                    }
                );


                card.addEventListener(
                    "click",
                    () => {

                        activateCard(
                            card
                        );

                    }
                );

            }
        );


        /* =================================================
           KEYBOARD ACCESSIBILITY
        ================================================= */

        cards.forEach(
            card => {

                card.addEventListener(
                    "keydown",
                    event => {

                        if (
                            event.key ===
                            "Enter" ||

                            event.key ===
                            " "
                        ) {

                            event.preventDefault();

                            activateCard(
                                card
                            );

                        }

                    }
                );

            }
        );


        /* =================================================
           MOUSE FOLLOW GLOW
        ================================================= */

        if (
            window.matchMedia(
                "(pointer:fine)"
            ).matches
        ) {

            grid.addEventListener(
                "mousemove",
                event => {

                    const rect =
                        grid.getBoundingClientRect();


                    const x =
                        event.clientX -
                        rect.left;


                    const y =
                        event.clientY -
                        rect.top;


                    const percentX =
                        x /
                        rect.width *
                        100;


                    const percentY =
                        y /
                        rect.height *
                        100;


                    if (redGlow) {
                        redGlow.style.left = `${percentX - 15}%`;
                        redGlow.style.top = `${percentY - 15}%`;
                    }

                }
            );

        }


        /* =================================================
           INITIAL STATE
        ================================================= */

        activateCard(
            document.querySelector(
                ".mission-card.active"
            ) ||
            cards[0]
        );


        /* =================================================
           SCROLL REVEAL
        ================================================= */

        const revealObserver =
            new IntersectionObserver(
                entries => {

                    entries.forEach(
                        entry => {

                            if (
                                entry.isIntersecting
                            ) {

                                entry.target.classList.add(
                                    "missions-visible"
                                );

                                revealObserver.unobserve(
                                    entry.target
                                );

                            }

                        }
                    );

                },
                {
                    threshold: .15
                }
            );


        document
            .querySelectorAll(
                ".missions-intro, .mission-card, .missions-bottom"
            )
            .forEach(
                element => {

                    revealObserver.observe(
                        element
                    );

                }
            );

    }
);

/* =========================================================
   THE TIN — DECODED INTERACTION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const scanner =
            document.getElementById(
                "tinScanner"
            );

        const tin =
            document.getElementById(
                "scannerTin"
            );


        if (!scanner || !tin) {
            return;
        }


        /* =================================================
           MOUSE PARALLAX
        ================================================== */

        const finePointer =
            window.matchMedia(
                "(pointer: fine)"
            );


        if (finePointer.matches) {

            scanner.addEventListener(
                "mousemove",
                (event) => {

                    const rect =
                        scanner.getBoundingClientRect();


                    const mouseX =
                        event.clientX -
                        rect.left;


                    const mouseY =
                        event.clientY -
                        rect.top;


                    const centerX =
                        rect.width / 2;


                    const centerY =
                        rect.height / 2;


                    const rotateY =
                        (
                            mouseX -
                            centerX
                        ) /
                        centerX *
                        7;


                    const rotateX =
                        (
                            centerY -
                            mouseY
                        ) /
                        centerY *
                        7;


                    tin.style.transform = `
                        rotateX(${rotateX}deg)
                        rotateY(${rotateY}deg)
                        rotateZ(-2deg)
                        scale(1.04)
                    `;

                }
            );


            scanner.addEventListener(
                "mouseleave",
                () => {

                    tin.style.transform = `
                        rotateX(0deg)
                        rotateY(0deg)
                        rotateZ(0deg)
                        scale(1)
                    `;

                }
            );

        }


        /* =================================================
           SCROLL REVEAL
        ================================================== */

        const revealElements =
            document.querySelectorAll(
                ".tin-copy, .tin-scanner, .tin-overview, .tin-spec, .inside-item, .tin-footer"
            );


        revealElements.forEach(
            element => {

                element.style.opacity = "0";

                element.style.transform =
                    "translateY(30px)";

                element.style.transition =
                    "opacity .8s ease, transform .8s cubic-bezier(.2,.8,.2,1)";

            }
        );


        const revealObserver =
            new IntersectionObserver(
                entries => {

                    entries.forEach(
                        entry => {

                            if (
                                !entry.isIntersecting
                            ) {

                                return;

                            }


                            entry.target.style.opacity =
                                "1";

                            entry.target.style.transform =
                                "translateY(0)";


                            revealObserver.unobserve(
                                entry.target
                            );

                        }
                    );

                },
                {
                    threshold: 0.12
                }
            );


        revealElements.forEach(
            element => {

                revealObserver.observe(
                    element
                );

            }
        );


        /* =================================================
           ENGINEERED BUTTON
        ================================================== */

        const button =
            document.querySelector(
                ".engineered-button"
            );


        if (button) {

            button.addEventListener(
                "click",
                () => {

                    const inside =
                        document.getElementById(
                            "whats-inside"
                        );


                    inside?.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                }
            );

        }


        /* =================================================
           SPEC CARD MICRO INTERACTION
        ================================================== */

        const specs =
            document.querySelectorAll(
                ".tin-spec"
            );


        specs.forEach(
            spec => {

                spec.addEventListener(
                    "mouseenter",
                    () => {

                        const icon =
                            spec.querySelector(
                                ".spec-icon"
                            );


                        if (icon) {

                            icon.style.transform =
                                "scale(1.15) rotate(-5deg)";

                            icon.style.transition =
                                "transform .3s ease";

                        }

                    }
                );


                spec.addEventListener(
                    "mouseleave",
                    () => {

                        const icon =
                            spec.querySelector(
                                ".spec-icon"
                            );


                        if (icon) {

                            icon.style.transform =
                                "scale(1) rotate(0)";

                        }

                    }
                );

            }
        );


    }
);

/* =========================================================
   FINAL LINK / UI SANITY PASS
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[href="#specs"]').forEach(a => a.setAttribute('href', '#whats-inside'));
  document.querySelectorAll('a[href="#shop"]').forEach(a => a.setAttribute('href', '#buy'));
  document.querySelectorAll('a[href="#stretch"]').forEach(a => a.setAttribute('href', '#lab'));

  // FAQ: close sibling items for a cleaner accordion feel.
  document.querySelectorAll('.faq-list details').forEach(detail => {
    detail.addEventListener('toggle', () => {
      if (!detail.open) return;
      document.querySelectorAll('.faq-list details[open]').forEach(other => {
        if (other !== detail) other.open = false;
      });
    });
  });
});
