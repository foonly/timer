import { createApp } from "vue";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import "./style.css";
import TimerApp from "./TimerApp.vue";
import { useTimerStore } from "./timerStore";

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
const app = createApp(TimerApp);

app.use(pinia);
app.mount("#app");
