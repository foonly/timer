import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { createApp } from "vue";
import TimerApp from "./TimerApp.vue";
import "./style.css";
import { initDarkLightMode } from "./darkLight";
import { startInterval } from "./helpers";

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
const app = createApp(TimerApp);

// Add a custom focus directive.
app.directive('focus', {
    mounted(el) { // When element is mounted.
        el.focus();
    }
});

app.use(pinia);
app.mount("#app");

startInterval();
initDarkLightMode();
