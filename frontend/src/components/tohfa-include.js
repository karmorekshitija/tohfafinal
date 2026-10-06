// Tohfa Shared Component Inclusion Script
(function () {
    const baseDir = '/src/components';

    // Start fetches immediately when script executes
    const navbarPromise = fetch(`${baseDir}/tohfa-navbar.html`)
        .then(response => {
            if (!response.ok) throw new Error("Navbar failed to load from: " + `${baseDir}/tohfa-navbar.html`);
            return response.text();
        });

    const footerPromise = fetch(`${baseDir}/tohfa-footer.html`)
        .then(response => {
            if (!response.ok) throw new Error("Footer failed to load from: " + `${baseDir}/tohfa-footer.html`);
            return response.text();
        });

    // Helper to execute scripts in dynamic HTML container
    function executeFooterScripts(container) {
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

    function insertComponents() {
        const navbarContainer = document.getElementById("tohfa-navbar");
        const footerContainer = document.getElementById("tohfa-footer");

        // Load Navbar
        if (navbarContainer) {
            navbarPromise
                .then(html => {
                    navbarContainer.innerHTML = html;
                    document.dispatchEvent(new CustomEvent('tohfa-navbar-loaded'));
                })
                .catch(err => {
                    console.error("Error loading navbar:", err);
                });
        }

        // Load Footer
        if (footerContainer) {
            footerPromise
                .then(html => {
                    footerContainer.innerHTML = html;
                    executeFooterScripts(footerContainer);
                })
                .catch(err => {
                    console.error("Error loading footer:", err);
                });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", insertComponents);
    } else {
        insertComponents();
    }
})();
