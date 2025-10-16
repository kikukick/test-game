// 簡易カスタムエフェクト群
tyrano.plugin.kag.tag.effect = {
    vital: ["name"],
    pm: {
        name: ""
    },
    start: function(pm) {
        switch(pm.name) {
            case "fadeIn":
                gsap.fromTo("#tyrano_base", {opacity: 0}, {opacity: 1, duration: 1});
                break;
            case "fadeOut":
                gsap.to("#tyrano_base", {opacity: 0, duration: 1});
                break;
            case "shake":
                gsap.to("#tyrano_base", {x: 10, duration: 0.05, yoyo: true, repeat: 10});
                break;
            case "darken":
                document.body.style.transition = "background 1s";
                document.body.style.background = "#000";
                break;
            case "sparkle":
                const container = document.createElement("div");
                container.style.position = "absolute";
                container.style.width = "100%";
                container.style.height = "100%";
                container.style.top = 0;
                container.style.left = 0;
                container.style.pointerEvents = "none";
                document.body.appendChild(container);

                for (let i = 0; i < 40; i++) {
                    const particle = document.createElement("div");
                    particle.style.position = "absolute";
                    particle.style.width = "6px";
                    particle.style.height = "6px";
                    particle.style.borderRadius = "50%";
                    particle.style.background = "rgba(255,255,255,0.8)";
                    particle.style.left = Math.random() * window.innerWidth + "px";
                    particle.style.top = Math.random() * window.innerHeight + "px";
                    container.appendChild(particle);
                    gsap.to(particle, {
                        y: -Math.random() * 200,
                        opacity: 0,
                        duration: 1 + Math.random(),
                        onComplete: () => particle.remove()
                    });
                }
                setTimeout(() => container.remove(), 2000);
                break;
        }
        this.kag.ftag.nextOrder();
    }
};
