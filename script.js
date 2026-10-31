// Mobile Navigation Toggle
document.addEventListener('DOMContentLoaded', function () {
    const mobileToggle = document.querySelector('.mobile-toggle');
    const mainNav = document.querySelector('.main-nav');

    if (mobileToggle) {
        mobileToggle.addEventListener('click', function () {
            this.classList.toggle('active');
            mainNav.classList.toggle('active');
        });
    }

    // Services Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            const targetTab = this.getAttribute('data-tab');

            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            // Add active class to current button and corresponding pane
            this.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 70,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Header scroll effect
    window.addEventListener('scroll', function () {
        const header = document.querySelector('.header');
        if (window.scrollY > 100) {
            header.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.1)';
        } else {
            header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        }
    });

    // Dropdown click-to-toggle (also supports closing on outside click)
    const dropdownAnchors = document.querySelectorAll('.dropdown > a');
    dropdownAnchors.forEach(anchor => {
        // ensure aria attribute for accessibility
        anchor.setAttribute('aria-haspopup', 'true');
        anchor.setAttribute('aria-expanded', 'false');

        anchor.addEventListener('click', function (e) {
            // If there's no submenu, allow default navigation
            const parent = this.parentElement;
            const submenu = parent.querySelector('.dropdown-menu');
            if (!submenu) return;

            // Prevent navigation for click-to-open behavior
            e.preventDefault();
            e.stopPropagation();

            // Close other open dropdowns
            document.querySelectorAll('.dropdown.open').forEach(d => {
                if (d !== parent) {
                    d.classList.remove('open');
                    const a = d.querySelector('a'); if (a) a.setAttribute('aria-expanded', 'false');
                }
            });

            // Toggle this dropdown
            const isOpen = parent.classList.toggle('open');
            this.setAttribute('aria-expanded', String(isOpen));
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown.open').forEach(d => {
                d.classList.remove('open');
                const a = d.querySelector('a'); if (a) a.setAttribute('aria-expanded', 'false');
            });
        }
    });


});