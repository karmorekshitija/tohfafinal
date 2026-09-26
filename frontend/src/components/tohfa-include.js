// Tohfa Shared Component Inclusion Script
(function() {
    function initSharedComponents() {
        const navbarContainers = document.querySelectorAll("#tohfa-navbar, [data-include*='tohfa-navbar']");
        const footerContainers = document.querySelectorAll("#tohfa-footer, [data-include*='tohfa-footer']");

        async function fetchComponent(primaryPath, fallbackPath) {
            try {
                const res = await fetch(primaryPath);
                if (res.ok) return await res.text();
            } catch (e) {
                // fall through to fallback
            }
            if (fallbackPath) {
                const resFallback = await fetch(fallbackPath);
                if (resFallback.ok) return await resFallback.text();
            }
            throw new Error(`Failed to load component from ${primaryPath} or ${fallbackPath}`);
        }

        // Helper to execute scripts in dynamic HTML container
        function executeScripts(container) {
            const scripts = container.querySelectorAll("script");
            scripts.forEach(oldScript => {
                const newScript = document.createElement("script");
                Array.from(oldScript.attributes).forEach(attr => {
                    newScript.setAttribute(attr.name, attr.value);
                });
                newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                oldScript.parentNode.replaceChild(newScript, oldScript);
            });
        }

        // Load Navbar
        if (navbarContainers.length > 0) {
            fetchComponent('/src/components/tohfa-navbar.html', '/components/tohfa-navbar.html')
                .then(html => {
                    navbarContainers.forEach(container => {
                        if (!container.innerHTML.trim()) {
                            container.innerHTML = html;
                            executeScripts(container);
                        }
                    });
                    document.dispatchEvent(new CustomEvent('tohfa-navbar-loaded'));
                })
                .catch(err => {
                    console.error("Error loading navbar:", err);
                });
        }

        // Load Footer
        if (footerContainers.length > 0) {
            fetchComponent('/src/components/tohfa-footer.html', '/components/tohfa-footer.html')
                .then(html => {
                    footerContainers.forEach(container => {
                        if (!container.innerHTML.trim()) {
                            container.innerHTML = html;
                            executeScripts(container);
                        }
                    });
                    document.dispatchEvent(new CustomEvent('tohfa-footer-loaded'));
                })
                .catch(err => {
                    console.error("Error loading footer:", err);
                });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", initSharedComponents);
    } else {
        initSharedComponents();
    }
})();
