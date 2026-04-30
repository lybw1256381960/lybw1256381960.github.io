const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const navLinks = document.querySelector("[data-nav-links]");
const navItems = Array.from(document.querySelectorAll(".nav-links a"));
const sections = navItems
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

const setHeaderState = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 12);
};

const closeNavigation = () => {
    navToggle.setAttribute("aria-expanded", "false");
    navLinks.classList.remove("is-open");
};

const openNavigation = () => {
    navToggle.setAttribute("aria-expanded", "true");
    navLinks.classList.add("is-open");
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    isOpen ? closeNavigation() : openNavigation();
});

navItems.forEach((link) => {
    link.addEventListener("click", closeNavigation);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeNavigation();
    }
});

document.addEventListener("click", (event) => {
    if (!navLinks.contains(event.target) && !navToggle.contains(event.target)) {
        closeNavigation();
    }
});

if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

    const navObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            navItems.forEach((link) => {
                link.classList.toggle("is-active", link.getAttribute("href") === `#${entry.target.id}`);
            });
        });
    }, { threshold: 0.35, rootMargin: "-20% 0px -55% 0px" });

    sections.forEach((section) => navObserver.observe(section));
} else {
    document.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
}

const year = document.querySelector("[data-year]");
if (year) {
    year.textContent = new Date().getFullYear();
}

const contactForm = document.getElementById("contact-form");
contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const name = formData.get("name").trim();
    const email = formData.get("email").trim();
    const message = formData.get("message").trim();
    const subject = encodeURIComponent(`来自个人主页的交流邀请：${name}`);
    const body = encodeURIComponent(`姓名：${name}\n邮箱：${email}\n\n留言内容：\n${message}`);

    window.location.href = `mailto:1256381960@qq.com?subject=${subject}&body=${body}`;
});
