<template>
  <div class="app-container">
    <h1 class="title">恒流源控制台</h1>
    
    <div class="tabs">
      <button class="tab active">和控制盒连接</button>
      <button class="tab disabled">与单独模块连接</button>
    </div>

    <div class="main-content">
      <!-- 第一行：串口连接 -->
      <div class="row row-1">
        <span>串口连接：</span>
        <select class="input-elem" v-model="selectedPort" :disabled="isConnected" @mouseenter="refreshPorts" @click="refreshPorts">
          <option v-for="p in availablePorts" :key="p" :value="p">{{ p }}</option>
        </select>
        <button class="btn-primary" @click="toggleConnection" :class="{ 'btn-danger': isConnected }">
          {{ isConnected ? '断开' : '连接' }}
        </button>
        <span class="uptime">开机时间: {{ formatTime(uptime) }}</span>
      </div>

      <!-- 第二行：仪表台 -->
      <div class="row row-2">
        <div class="gauge-box">
          <span class="gauge-title">当前输入电压</span>
          <div ref="chartVoltage" class="chart"></div>
          <div class="value-text">{{ (sysInVoltage).toFixed(1) }} V</div>
        </div>
        <div class="gauge-box">
          <span class="gauge-title">热敏电阻 1</span>
          <div class="thermo-container">
            <div class="thermo-track">
              <div class="thermo-gradient"></div>
              <div class="thermo-cover" :style="{ width: getThermoCoverWidth(temp1) }"></div>
            </div>
            <div class="thermo-axis">
              <span>-50</span><span>0</span><span>50</span><span>100</span><span>150</span>
            </div>
          </div>
          <div class="value-text">T1: {{ temp1.toFixed(1) }}℃</div>
        </div>
        <div class="gauge-box">
          <span class="gauge-title">热敏电阻 2</span>
          <div class="thermo-container">
            <div class="thermo-track">
              <div class="thermo-gradient"></div>
              <div class="thermo-cover" :style="{ width: getThermoCoverWidth(temp2) }"></div>
            </div>
            <div class="thermo-axis">
              <span>-50</span><span>0</span><span>50</span><span>100</span><span>150</span>
            </div>
          </div>
          <div class="value-text">T2: {{ temp2.toFixed(1) }}℃</div>
        </div>
        <div class="gauge-box wave-box">
          <span class="gauge-title">外触发信号</span>
          <div ref="chartWave" class="chart wave-chart"></div>
        </div>
      </div>

      <!-- 第三行：强电总开关与故障报警区 -->
      <div class="row row-3" :class="{ 'fault-bg': faultCode !== 0 }">
        <label class="switch-container">
          <span class="switch-label">强电总开关</span>
          <input type="checkbox" v-model="mainPowerSwitch" @change="onMainPowerChange" :disabled="!isConnected">
          <span class="slider"></span>
        </label>
        
        <!-- 致命故障提示 -->
        <div v-if="faultCode !== 0" class="fault-box">
          <span class="fault-text">⚠️ 系统保护锁定: {{ faultMsg }}</span>
          <button class="btn-danger btn-clear" @click="clearFaults">尝试清障</button>
        </div>

        <!-- 警告提示（非致命） -->
        <div v-if="warnCode !== 0 && faultCode === 0" class="warn-box">
          <span class="warn-text">提示: {{ warnMsg }}</span>
        </div>
      </div>

      <!-- 第四行：通道控制区 -->
      <div class="row row-4" :class="{ 'disabled-area': !mainPowerSwitch || !isConnected || faultCode !== 0 }">
        <!-- 通道 1 -->
        <div class="col channel-col">
          <h3 class="col-title">通道1</h3>
          <div class="control-item tooltip-box">
            <span class="label-text">电流设置(A):</span>
            <input class="input-elem" type="number" step="0.01" min="0.2" max="3" v-model.lazy="ch1.setCurr" @change="updateCh1Current">
            <span class="tooltip">请输入0.2-3之间的数字。</span>
          </div>
          <div class="control-item tooltip-box">
            <span class="label-text">单次输出(s):</span>
            <input class="input-elem" type="number" step="0.001" min="0.005" max="100" v-model.lazy="ch1.setMaxTime" @change="updateCh1Time">
            <span class="tooltip">请输入0.005-100之间的数字。</span>
          </div>
          <div class="control-item">
            <span class="label-text">开关模式:</span>
            <select class="input-elem" v-model="ch1.triggerMode" @change="updateCh1Trigger">
              <option :value="0">内触发</option>
              <option :value="1">外触发</option>
            </select>
          </div>
          
          <!-- 脉冲/单次 Tab 区域 -->
          <div class="pulse-tabs">
            <div class="ptab-headers">
              <span :class="{'active': ch1.tab === 0}" @click="switchTab(1, 0)">单次输出</span>
              <span :class="{'active': ch1.tab === 1}" @click="switchTab(1, 1)">脉冲输出</span>
            </div>
            <div class="ptab-content" v-if="ch1.tab === 0">
              <div class="control-item">
                <span class="label-text">输出开关:</span>
                <div class="switch-wrapper">
                  <label class="switch-container small">
                    <input type="checkbox" v-model="ch1.isOn" @change="toggleCh1">
                    <span class="slider"></span>
                  </label>
                  <span class="countdown" v-if="ch1.isOn">{{ ch1.countdown }} s</span>
                </div>
              </div>
            </div>
            <div class="ptab-content" v-if="ch1.tab === 1">
              <div class="control-item">
                <span class="label-text">脉冲间隔(s):</span>
                <input class="input-elem" type="number" step="0.001" min="0.005" max="100" v-model.lazy="ch1.pulseInterval" @change="updateCh1PulseInterval">
              </div>
              <div class="control-item">
                <span class="label-text">脉冲开关:</span>
                <div class="switch-wrapper">
                  <label class="switch-container small">
                    <input type="checkbox" v-model="ch1.pulseOn" @change="togglePulse(1)">
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="control-item">
            <span class="label-text">实时电流:</span>
            <span class="val-text">{{ ch1.realCurr.toFixed(2) }} A</span>
          </div>
          <div class="control-item">
            <span class="label-text">实时电压:</span>
            <span class="val-text">{{ ch1.realVolt.toFixed(2) }} V</span>
          </div>
        </div>

        <!-- 合控 -->
        <div class="col center-col">
          <h3 class="col-title">合控</h3>
          <button class="btn-sync" @click="syncOpen">同开</button>
          <button class="btn-sync btn-danger" @click="syncClose">同关</button>
          <!-- 新增脉冲合控 -->
          <button class="btn-sync" style="margin-top: 15px;" @click="syncPulseOpen">脉冲开</button>
          <button class="btn-sync btn-danger" @click="syncPulseClose">脉冲关</button>
        </div>

        <!-- 通道 2 -->
        <div class="col channel-col">
          <h3 class="col-title">通道2</h3>
          <div class="control-item tooltip-box">
            <span class="label-text">电流设置(A):</span>
            <input class="input-elem" type="number" step="0.01" min="0.2" max="3" v-model.lazy="ch2.setCurr" @change="updateCh2Current">
            <span class="tooltip">请输入0.2-3之间的数字。</span>
          </div>
          <div class="control-item tooltip-box">
            <span class="label-text">单次输出(s):</span>
            <input class="input-elem" type="number" step="0.001" min="0.005" max="100" v-model.lazy="ch2.setMaxTime" @change="updateCh2Time">
            <span class="tooltip">请输入0.005-100之间的数字。</span>
          </div>
          <div class="control-item">
            <span class="label-text">开关模式:</span>
            <select class="input-elem" v-model="ch2.triggerMode" @change="updateCh2Trigger">
              <option :value="0">内触发</option>
              <option :value="1">外触发</option>
            </select>
          </div>

          <!-- 脉冲/单次 Tab 区域 -->
          <div class="pulse-tabs">
            <div class="ptab-headers">
              <span :class="{'active': ch2.tab === 0}" @click="switchTab(2, 0)">单次输出</span>
              <span :class="{'active': ch2.tab === 1}" @click="switchTab(2, 1)">脉冲输出</span>
            </div>
            <div class="ptab-content" v-if="ch2.tab === 0">
              <div class="control-item">
                <span class="label-text">输出开关:</span>
                <div class="switch-wrapper">
                  <label class="switch-container small">
                    <input type="checkbox" v-model="ch2.isOn" @change="toggleCh2">
                    <span class="slider"></span>
                  </label>
                  <span class="countdown" v-if="ch2.isOn">{{ ch2.countdown }} s</span>
                </div>
              </div>
            </div>
            <div class="ptab-content" v-if="ch2.tab === 1">
              <div class="control-item">
                <span class="label-text">脉冲间隔(s):</span>
                <input class="input-elem" type="number" step="0.001" min="0.005" max="100" v-model.lazy="ch2.pulseInterval" @change="updateCh2PulseInterval">
              </div>
              <div class="control-item">
                <span class="label-text">脉冲开关:</span>
                <div class="switch-wrapper">
                  <label class="switch-container small">
                    <input type="checkbox" v-model="ch2.pulseOn" @change="togglePulse(2)">
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="control-item">
            <span class="label-text">实时电流:</span>
            <span class="val-text">{{ ch2.realCurr.toFixed(2) }} A</span>
          </div>
          <div class="control-item">
            <span class="label-text">实时电压:</span>
            <span class="val-text">{{ ch2.realVolt.toFixed(2) }} V</span>
          </div>
        </div>
      </div>

      <!-- 第五行：日志与调试区 -->
      <div class="row row-5">
        <h3 class="log-title">日志</h3>
        <div class="log-container">
          <div class="log-box log-history">
            <h4>关键操作记录</h4>
            <div class="log-content">
              <div v-for="(log, idx) in logs" :key="idx" class="log-item">{{ log }}</div>
            </div>
          </div>
          <div class="log-box hex-box">
            <h4>最新发送数据 (TX)</h4>
            <div class="hex-content">{{ latestTx || '暂无数据' }}</div>
          </div>
          <div class="log-box hex-box">
            <h4>最新接收数据 (RX)</h4>
            <div class="hex-content">{{ latestRx || '暂无数据' }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import * as echarts from 'echarts'

const availablePorts = ref([])
const selectedPort = ref('')
const isConnected = ref(false)
const uptime = ref(0)
const sysInVoltage = ref(0)
const temp1 = ref(0)
const temp2 = ref(0)
const extTriggerHistory = reactive(Array(25).fill(0))
const mainPowerSwitch = ref(false)

const ch1 = reactive({ setCurr: 0, setMaxTime: 0, triggerMode: 0, isOn: false, countdown: 0, realCurr: 0, realVolt: 0, tab: 0, pulseInterval: 1, pulseOn: false })
const ch2 = reactive({ setCurr: 0, setMaxTime: 0, triggerMode: 0, isOn: false, countdown: 0, realCurr: 0, realVolt: 0, tab: 0, pulseInterval: 1, pulseOn: false })
const logs = ref([])
const latestTx = ref('')
const latestRx = ref('')

// 故障与警告状态
const faultCode = ref(0)
const faultMsg = ref('')
const warnCode = ref(0)
const warnMsg = ref('')

const chartVoltage = ref(null), chartWave = ref(null)
let eChartVoltage, eChartWave
let pollingTimer = null
let rxBuffer =[]

// ======= 并发请求解析管理机制 =======
let resolveAuth = null;
let resolveSync = null;
let pendingVerifies =[]; 

const NTC_TABLE = [[-40,187.52],[-39,177.56],[-38,168.19],[-37,159.38],[-36,151.09],[-35,143.29],[-34,135.94],[-33,129.02],[-32,122.51],[-31,116.36],[-30,110.57],[-29,105.1],[-28,99.95],[-27,95.07],[-26,90.47],[-25,86.13],[-24,82.01],[-23,78.12],[-22,74.44],[-21,70.95],[-20,67.64],[-19,64.51],[-18,61.53],[-17,58.71],[-16,56.03],[-15,53.49],[-14,51.07],[-13,48.78],[-12,46.59],[-11,44.52],[-10,42.54],[-9,40.66],[-8,38.88],[-7,37.17],[-6,35.56],[-5,34.01],[-4,32.55],[-3,31.15],[-2,29.82],[-1,28.55],[0,27.35],[1,26.2],[2,25.1],[3,24.06],[4,23.07],[5,22.12],[6,21.21],[7,20.35],[8,19.52],[9,18.73],[10,17.98],[11,17.25],[12,16.64],[13,16.06],[14,15.49],[15,14.95],[16,14.42],[17,13.91],[18,13.42],[19,12.95],[20,12.5],[21,12.06],[22,11.63],[23,11.22],[24,10.83],[25,10.45],[26,10.08],[27,9.73],[28,9.38],[29,9.05],[30,8.74],[31,8.43],[32,8.13],[33,7.85],[34,7.57],[35,7.3],[36,7.05],[37,6.8],[38,6.56],[39,6.33],[40,6.11],[41,5.89],[42,5.69],[43,5.49],[44,5.29],[45,5.11],[46,4.93],[47,4.75],[48,4.59],[49,4.43],[50,4.27],[51,4.12],[52,3.97],[53,3.83],[54,3.7],[55,3.57],[56,3.44],[57,3.32],[58,3.21],[59,3.09],[60,2.98],[61,2.88],[62,2.78],[63,2.68],[64,2.59],[65,2.5],[66,2.4],[67,2.319],[68,2.248],[69,2.185],[70,2.126],[71,2.069],[72,2.013],[73,1.957],[74,1.901],[75,1.845],[76,1.789],[77,1.735],[78,1.686],[79,1.644],[80,1.612],[81,1.5541],[82,1.5191],[83,1.4864],[84,1.4557],[85,1.4269],[86,1.4],[87,1.3749],[88,1.3514],[89,1.3295],[90,1.309] ]
function adcToTemp(adcValue) {
  if (adcValue <= 0) return -50; 
  if (adcValue >= 4095) return 120;
  let rt = (10 * adcValue) / (4095 - adcValue);
  if (rt >= NTC_TABLE[0][1]) return NTC_TABLE[0][0]; 
  if (rt <= NTC_TABLE[NTC_TABLE.length - 1][1]) return NTC_TABLE[NTC_TABLE.length - 1][0]; 
  for (let i = 0; i < NTC_TABLE.length - 1; i++) {
    if (rt <= NTC_TABLE[i][1] && rt >= NTC_TABLE[i+1][1]) {
      let fraction = (NTC_TABLE[i][1] - rt) / (NTC_TABLE[i][1] - NTC_TABLE[i+1][1]);
      return NTC_TABLE[i][0] + fraction * (NTC_TABLE[i+1][0] - NTC_TABLE[i][0]);
    }
  }
  return 0;
}
const getThermoCoverWidth = (temp) => ((100 - (((Math.max(-50, Math.min(120, temp)) + 50) / 170) * 100)).toFixed(1) + '%')

const addLog = (msg, packet = null) => {
  const now = new Date()
  const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`
  let logStr = `[${timeStr}] ${msg}`
  if (packet) logStr += ` | 数据: ${formatHex(packet)}`
  logs.value.unshift(logStr)
  if (logs.value.length > 50) logs.value.pop()
}

const formatHex = (arr) => Array.from(arr).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
const sendSerialData = (buffer) => {
  latestTx.value = formatHex(buffer)
  window.electronAPI.sendData(buffer)
}

function buildPacket(opType, page, addr, dataArr =[]) {
  const len = Math.max(1, dataArr.length)
  if (dataArr.length === 0) for(let i=0; i<len; i++) dataArr.push(0x00)
  const packet =[0x5A, 0x5A, opType, len, page, addr & 0xFF, (addr >> 8) & 0xFF, ...dataArr]
  let sum = 0
  for (let i = 2; i < packet.length; i++) sum += packet[i]
  packet.push(sum & 0xFF)
  return new Uint8Array(packet)
}

function getU16(arr, idx) { return (arr[idx] | (arr[idx+1] << 8)) >>> 0 }
function getU32(arr, idx) { return (arr[idx] | (arr[idx+1]<<8) | (arr[idx+2]<<16) | (arr[idx+3]<<24)) >>> 0 }

const refreshPorts = async () => {
  if (isConnected.value) return;
  const ports = await window.electronAPI.getPorts();
  availablePorts.value = ports.filter(p => p.toLowerCase().includes('usb'));
  if (availablePorts.value.length > 0 && !availablePorts.value.includes(selectedPort.value)) {
    selectedPort.value = availablePorts.value[0];
  } else if (availablePorts.value.length === 0) selectedPort.value = '';
}

onMounted(async () => {
  await refreshPorts()
  initCharts()

  window.electronAPI.onData((data) => {
    rxBuffer.push(...data)
    while(rxBuffer.length >= 9) {
      if(rxBuffer[0] === 0x5A && rxBuffer[1] === 0x5A) {
        let opLen = rxBuffer[3]
        let expectedLen = 8 + opLen
        if(rxBuffer.length >= expectedLen) {
          let packet = rxBuffer.splice(0, expectedLen)
          latestRx.value = formatHex(packet)
          parseIncomingPacket(packet)
        } else break;
      } else rxBuffer.shift()
    }
  })
})

const toggleConnection = async () => {
  if (isConnected.value) {
    await window.electronAPI.connectPort(selectedPort.value, false)
    isConnected.value = false
    addLog(`串口已断开`)
    clearInterval(pollingTimer)
  } else {
    const success = await window.electronAPI.connectPort(selectedPort.value, true)
    if (!success) { addLog(`串口 ${selectedPort.value} 连接失败`); return; }

    addLog(`串口已打开，正在校验设备合法性...`)
    const authPacket = buildPacket(0x01, 2, 0, new Array(4).fill(0))
    sendSerialData(authPacket)

    try {
      const authData = await new Promise((resolve, reject) => {
        resolveAuth = resolve;
        setTimeout(() => { resolveAuth = null; reject('timeout'); }, 1500); 
      });
      
      if (getU32(authData, 0) !== 0xABCD) throw new Error('invalid_id');
      addLog(`设备校验通过!`)

      addLog(`正在同步下位机运行参数...`)
      const syncPacket = buildPacket(0x01, 0, 0, new Array(15).fill(0));
      sendSerialData(syncPacket);

      const syncData = await new Promise((resolve, reject) => {
        resolveSync = resolve;
        setTimeout(() => { resolveSync = null; reject('timeout'); }, 1500);
      });

      mainPowerSwitch.value = (syncData[0] !== 0);
      ch1.triggerMode = syncData[1];
      ch1.setCurr = Number(dacToCurr(getU16(syncData, 2)).toFixed(2));
      ch1.setMaxTime = getU32(syncData, 4) / 1000;
      ch2.triggerMode = syncData[8];
      ch2.setCurr = Number(dacToCurr(getU16(syncData, 9)).toFixed(2));
      ch2.setMaxTime = getU32(syncData, 11) / 1000;
      addLog(`参数同步完成!`)

      isConnected.value = true
      startPolling()

    } catch (e) {
      await window.electronAPI.connectPort(selectedPort.value, false)
      alert("设备校验失败，请检查是否选择了正确的串口或固件是否匹配！");
      addLog(`设备校验失败，自动断开连接`);
    }
  }
}

// 解析
function parseIncomingPacket(packet) {
  let op = packet[2];
  let opLen = packet[3];
  let page = packet[4];
  let addr = packet[5] | (packet[6] << 8);
  let data = packet.slice(7, 7 + opLen);

  if (op === 0x01) { 
    // A. 日常心跳轮询 (包含故障提取)
    if (page === 2 && addr === 0 && opLen >= 29) {
      if(!isConnected.value) return; 
      uptime.value = getU32(data, 4)
      sysInVoltage.value = (getU16(data, 12) / 4095 * 3.3) * 11 

      ch1.realCurr = (getU16(data, 14) / 4095 * 3.3) * 2
      ch1.realVolt = (getU16(data, 16) / 4095 * 3.3) * 11
      if(data[18] === 0) ch1.isOn = false;

      ch2.realCurr = (getU16(data, 19) / 4095 * 3.3) * 2
      ch2.realVolt = (getU16(data, 21) / 4095 * 3.3) * 11
      if(data[23] === 0) ch2.isOn = false;

      temp1.value = adcToTemp(getU16(data, 24))
      temp2.value = adcToTemp(getU16(data, 26))

      // 提取故障码和警告码
      faultCode.value = data[8];
      warnCode.value = data[11];

      // 只要发生致命故障，单片机底层就会强制关闭总开关，此时强制 UI 同步关闭！
      if (data[8] !== 0) {
        mainPowerSwitch.value = false;
      }
      
      let fMsg =[];
      if (data[8] & (1<<0)) fMsg.push("T1过热");
      if (data[8] & (1<<1)) fMsg.push("T1断连或过冷");
      if (data[8] & (1<<2)) fMsg.push("T2过热");
      if (data[8] & (1<<3)) fMsg.push("T2断连或过冷");
      if (data[8] & (1<<4)) fMsg.push("输入电压过高");
      if (data[8] & (1<<5)) fMsg.push("输入电压过低");
      if (data[8] & (1<<6)) fMsg.push("CH1电路异常");
      if (data[8] & (1<<7)) fMsg.push("CH2电路异常");
      faultMsg.value = fMsg.join(" | ");

      let wMsg =[];
      if (data[11] & (1<<0)) wMsg.push("CH1未接负载");
      if (data[11] & (1<<1)) wMsg.push("CH2未接负载");
      warnMsg.value = wMsg.join(" | ");

      let extTrig = data[28] !== 0 ? 1 : 0
      extTriggerHistory.shift()
      extTriggerHistory.push(extTrig)
      updateCharts()
    } 
    // B. 设备校验返回
    else if (page === 2 && addr === 0 && opLen === 4) {
      if (resolveAuth) { resolveAuth(data); resolveAuth = null; }
    }
    // C. 同步参数返回 
    else if (page === 0 && addr === 0 && opLen === 15) {
      if (resolveSync) { resolveSync(data); resolveSync = null; }
    }
    // D. 修改参数后的回读验证返回 
    else if (page === 0) {
      let idx = pendingVerifies.findIndex(p => p.page === page && p.addr === addr);
      if (idx !== -1) pendingVerifies.splice(idx, 1)[0].resolve({ data, packet });
    }
  }
}

function startPolling() {
  pollingTimer = setInterval(() => {
    const req = buildPacket(0x01, 2, 0, new Array(29).fill(0))
    sendSerialData(req)
  }, 200)
}

// 写入验证机制
const writeAndVerify = async (page, addr, dataArr, logName) => {
  const wPkt = buildPacket(0x00, page, addr, dataArr)
  sendSerialData(wPkt)
  addLog(`尝试修改 ${logName}...`, wPkt)

  await new Promise(r => setTimeout(r, 100)); // 等待EEPROM和单片机逻辑响应

  const rPkt = buildPacket(0x01, page, addr, new Array(dataArr.length).fill(0))
  sendSerialData(rPkt)

  try {
    const { data: readData, packet: rawPacket } = await new Promise((resolve, reject) => {
      pendingVerifies.push({ page, addr, resolve });
      setTimeout(() => { 
        pendingVerifies = pendingVerifies.filter(p => p.resolve !== resolve); 
        reject('timeout'); 
      }, 1000);
    });

    addLog(`验证读取原始数据`, rawPacket)

    let match = true;
    for(let i=0; i<dataArr.length; i++) {
      if (readData[i] !== dataArr[i]) match = false;
    }

    if (match) {
      addLog(`${logName} 修改成功!`)
    } else {
      addLog(`【失败】${logName} 验证不一致! 上位机已恢复为下位机真实状态。`)
      revertUI(page, addr, readData)
    }
  } catch(e) {
    addLog(`【超时】${logName} 修改验证未响应!`)
  }
}

// 回滚UI
const revertUI = (page, addr, data) => {
  if (page === 0) {
    if(addr === 0) mainPowerSwitch.value = (data[0] !== 0);
    if(addr === 1) ch1.triggerMode = data[0];
    if(addr === 2) ch1.setCurr = Number(dacToCurr(getU16(data, 0)).toFixed(2));
    if(addr === 4) ch1.setMaxTime = getU32(data, 0) / 1000;
    if(addr === 8) ch2.triggerMode = data[0];
    if(addr === 9) ch2.setCurr = Number(dacToCurr(getU16(data, 0)).toFixed(2));
    if(addr === 11) ch2.setMaxTime = getU32(data, 0) / 1000;
  }
}
// 增加输入校验函数
const validateVal = (val, min, max, msg) => {
  let num = Number(val);
  if (isNaN(num)) num = min;
  if (num > max) { alert(msg); return max; }
  if (num < min) { alert(msg); return min; }
  return num;
}
const currToDac = (A) => Math.round(((A / 2) / 3.3) * 4095)
const dacToCurr = (dac) => ((dac / 4095) * 3.3) * 2

const onMainPowerChange = () => writeAndVerify(0, 0,[mainPowerSwitch.value ? 1 : 0], '强电总开关');

const updateCh1Current = () => {
  ch1.setCurr = validateVal(ch1.setCurr, 0.2, 3, '电流范围为0.2-3A');
  let dac = currToDac(ch1.setCurr)
  writeAndVerify(0, 2,[dac & 0xFF, (dac >> 8) & 0xFF], `通道1电流(${ch1.setCurr}A)`)
}
const updateCh2Current = () => {
  ch2.setCurr = validateVal(ch2.setCurr, 0.2, 3, '电流范围为0.2-3A');
  let dac = currToDac(ch2.setCurr)
  writeAndVerify(0, 9, [dac & 0xFF, (dac >> 8) & 0xFF], `通道2电流(${ch2.setCurr}A)`)
}

const updateCh1Time = () => {
  ch1.setMaxTime = validateVal(ch1.setMaxTime, 0.005, 100, '时间范围为0.005-100s');
  let ms = Math.round(ch1.setMaxTime * 1000)
  writeAndVerify(0, 4,[ms & 0xFF, (ms>>8)&0xFF, (ms>>16)&0xFF, (ms>>24)&0xFF], `通道1时长(${ch1.setMaxTime}s)`)
}
const updateCh2Time = () => {
  ch2.setMaxTime = validateVal(ch2.setMaxTime, 0.005, 100, '时间范围为0.005-100s');
  let ms = Math.round(ch2.setMaxTime * 1000)
  writeAndVerify(0, 11,[ms & 0xFF, (ms>>8)&0xFF, (ms>>16)&0xFF, (ms>>24)&0xFF], `通道2时长(${ch2.setMaxTime}s)`)
}

// 新增脉冲间隔输入的校验和更新
const updateCh1PulseInterval = () => { ch1.pulseInterval = validateVal(ch1.pulseInterval, 0.005, 100, '时间范围为0.005-100s'); }
const updateCh2PulseInterval = () => { ch2.pulseInterval = validateVal(ch2.pulseInterval, 0.005, 100, '时间范围为0.005-100s'); }

const updateCh1Trigger = () => writeAndVerify(0, 1,[ch1.triggerMode], `通道1触发模式`);
const updateCh2Trigger = () => writeAndVerify(0, 8,[ch2.triggerMode], `通道2触发模式`);

// 【修改点】尝试清除故障码功能
const clearFaults = () => {
  const p = buildPacket(0x00, 1, 0, [1]);
  sendSerialData(p);
  addLog('发送尝试清除故障指令', p);
}

const toggleCh1 = () => {
  if(ch1.isOn) {
    const p = buildPacket(0x00, 1, 3, [1]); sendSerialData(p);
    startCountdown(ch1); addLog('通道1开始输出', p)
  } else {
    const p = buildPacket(0x00, 1, 4,[1]); sendSerialData(p);
    ch1.countdown = 0; addLog('通道1停止输出', p)
  }
}
const toggleCh2 = () => {
  if(ch2.isOn) {
    const p = buildPacket(0x00, 1, 5,[1]); sendSerialData(p);
    startCountdown(ch2); addLog('通道2开始输出', p)
  } else {
    const p = buildPacket(0x00, 1, 6,[1]); sendSerialData(p);
    ch2.countdown = 0; addLog('通道2停止输出', p)
  }
}

const syncOpen = () => {
  const p = buildPacket(0x00, 1, 1,[1]); sendSerialData(p);
  ch1.isOn = true; ch2.isOn = true
  startCountdown(ch1); startCountdown(ch2); addLog('合控：双通道同开', p)
}
const syncClose = () => {
  const p = buildPacket(0x00, 1, 2, [1]); sendSerialData(p);
  ch1.isOn = false; ch2.isOn = false
  ch1.countdown = 0; ch2.countdown = 0; addLog('合控：双通道同关', p)
}
// 切换 Tab 处理逻辑
const switchTab = (chNum, tabIdx) => {
  const ch = chNum === 1 ? ch1 : ch2;
  if (ch.tab === tabIdx) return;
  
  if (tabIdx === 1) { // 切换到脉冲
    if (ch.isOn) {
      const p = buildPacket(0x00, 1, chNum === 1 ? 4 : 6, [1]);
      sendSerialData(p);
      ch.isOn = false;
      ch.countdown = 0;
      addLog(`通道${chNum}切换脉冲模式，主动停止当前输出`, p);
    }
  } else { // 切换到单次
    if (ch.pulseOn) {
      ch.pulseOn = false; // 这会让正在运行的 while 循环自动退出并发送 stop 指令
    }
  }
  ch.tab = tabIdx;
}

// 供延时和硬件故障阻断使用的软中断检查
const waitWithCheck = async (ch, ms) => {
  let steps = Math.floor(ms / 20);
  let remainder = ms % 20;
  for(let i = 0; i < steps; i++) {
    // 一旦关闭总开关、关闭脉冲或出现故障，立刻熔断延时
    if(!ch.pulseOn || !mainPowerSwitch.value || faultCode.value !== 0) return false;
    await new Promise(r => setTimeout(r, 20));
  }
  if(remainder > 0) {
    if(!ch.pulseOn || !mainPowerSwitch.value || faultCode.value !== 0) return false;
    await new Promise(r => setTimeout(r, remainder));
  }
  return (ch.pulseOn && mainPowerSwitch.value && faultCode.value === 0);
}

// 脉冲开关控制逻辑
const togglePulse = async (chNum) => {
  const ch = chNum === 1 ? ch1 : ch2;
  if (ch.pulseOn) {
    addLog(`通道${chNum}脉冲开启`);
    
    // 开始死循环脉冲
    while (ch.pulseOn && mainPowerSwitch.value && faultCode.value === 0) {
      // 1. 发送开启指令
      const pStart = buildPacket(0x00, 1, chNum === 1 ? 3 : 5, [1]);
      sendSerialData(pStart);
      
      // 2. 等待设定时间(s)
      let keepGoing = await waitWithCheck(ch, Math.round(ch.setMaxTime * 1000));
      if (!keepGoing) break; // 期间被阻断，退出循环

      // 3. 发送停止指令
      const pStop = buildPacket(0x00, 1, chNum === 1 ? 4 : 6,[1]);
      sendSerialData(pStop);
      
      // 4. 等待脉冲间隔(s)
      keepGoing = await waitWithCheck(ch, Math.round(ch.pulseInterval * 1000));
      if (!keepGoing) break;
    }

    // 循环退出后，如果是故障导致退出的，也要强制复位UI状态
    ch.pulseOn = false;
    
    // 保底：无论以什么方式退出循环，必须下发一条彻底关闭的指令
    const pStopFinal = buildPacket(0x00, 1, chNum === 1 ? 4 : 6, [1]);
    sendSerialData(pStopFinal);
    addLog(`通道${chNum}脉冲已关闭`);
  }
}

// 脉冲合控
const syncPulseOpen = () => {
  switchTab(1, 1);
  switchTab(2, 1);
  if (!ch1.pulseOn) { ch1.pulseOn = true; togglePulse(1); }
  if (!ch2.pulseOn) { ch2.pulseOn = true; togglePulse(2); }
}
const syncPulseClose = () => {
  switchTab(1, 1);
  switchTab(2, 1);
  ch1.pulseOn = false; 
  ch2.pulseOn = false;
}
function startCountdown(ch) {
  ch.countdown = ch.setMaxTime
  let t = setInterval(() => {
    if(!ch.isOn || ch.countdown <= 0) { clearInterval(t); ch.isOn = false; }
    else ch.countdown--
  }, 1000)
}

const formatTime = (s) => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

function initCharts() {
  eChartVoltage = echarts.init(chartVoltage.value)
  eChartVoltage.setOption({ series:[{ type: 'gauge', min: 0, max: 30, splitNumber: 6, axisLabel: { fontSize: 11, distance: -20 }, detail: {show: false}, data: [{value: 0}], axisLine: { lineStyle: { width: 10 } } }]})
  
  eChartWave = echarts.init(chartWave.value)
  eChartWave.setOption({ 
    animation: false,  // <==== 【就是加上这一行，关闭该图表的补间动画】

    grid: { left: 25, right: 15, top: 20, bottom: 25, show: true, borderColor: '#ddd' }, 
    xAxis: { type: 'category', show: true, axisLabel: { show: false }, axisTick: { show: false } }, 
    yAxis: { type: 'value', min: -0.3, max: 1.3, show: true, splitLine: { show: true, lineStyle: { type: 'dashed' } }, axisLabel: { fontSize: 10 } }, 
    series:[{ type: 'line', step: 'start', data: extTriggerHistory, itemStyle: {color: '#409eff'}, areaStyle: { color: 'rgba(64,158,255,0.1)' } }] 
  })
}

function updateCharts() {
  eChartVoltage.setOption({ series: [{ data:[{value: sysInVoltage.value}] }]})
  eChartWave.setOption({ series: [{ data: extTriggerHistory }] })
}
</script>

<style scoped>
.app-container { font-family: sans-serif; padding: 20px; color: #333; }
.title { text-align: center; }
.tabs { display: flex; margin-bottom: 20px; border-bottom: 2px solid #ccc; }
.tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-size: 16px; }
.tab.active { border-bottom: 3px solid #409eff; font-weight: bold; color: #409eff; }
.tab.disabled { color: #aaa; cursor: not-allowed; }

.row { display: flex; align-items: center; margin-bottom: 15px; padding: 15px; border: 1px solid #eee; border-radius: 8px; }
.row-1 { gap: 15px; } 
.btn-primary { padding: 5px 15px; cursor: pointer; }
.uptime { margin-left: auto; color: #666; } 

.row-2 { justify-content: space-around; align-items: stretch; }
.gauge-box { width: 200px; height: 210px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; position: relative; }
.gauge-title { font-size: 16px; font-weight: normal; margin-bottom: 10px; color: #333; text-align: center;}
.chart { width: 100%; flex: 1; }
.value-text { font-size: 18px; font-weight: bold; margin-top: -10px; z-index: 10; text-align: center;}

.thermo-container { width: 90%; flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; }
.thermo-track { position: relative; width: 100%; height: 18px; border-radius: 9px; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); background-color: #f0f0f0;}
.thermo-gradient { position: absolute; left: 0; top: 0; width: 100%; height: 100%; background: linear-gradient(to right, #1890ff 0%, #52c41a 30%, #faad14 60%, #f5222d 100%); }
.thermo-cover { position: absolute; right: 0; top: 0; height: 100%; background: #e0e0e0; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); border-left: 2px solid #fff;}
.thermo-axis { display: flex; justify-content: space-between; width: 100%; font-size: 11px; color: #666; margin-top: 5px; }

/* 故障与报警区样式 */
.row-3 { justify-content: center; background-color: #fafafa; transition: background-color 0.3s;}
.fault-bg { background-color: #fff0f0; border-color: #ffcccc; }
.fault-box { margin-left: 20px; display: flex; align-items: center; gap: 15px; }
.fault-text { color: #d93025; font-weight: bold; font-size: 14px;}
.warn-box { margin-left: 20px; }
.warn-text { color: #faad14; font-weight: bold; font-size: 14px;}
.btn-clear { padding: 5px 12px; border:none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;}

.row-4 { align-items: stretch; transition: opacity 0.3s; }
.col { flex: 1; padding: 10px 20px; border-right: 1px solid #eee; }
.col:last-child { border-right: none; }
.center-col { flex: 0.3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; }
.col-title { text-align: center; margin-top: 0; padding-bottom: 10px; border-bottom: 1px solid #eee; }

.control-item { margin: 12px 0; display: flex; align-items: center; }
.label-text { width: 110px; text-align: right; margin-right: 15px; font-size: 14px; display: inline-block; color: #555;}
.input-elem { width: 120px; padding: 4px; box-sizing: border-box; font-size: 14px;}
.val-text { width: 120px; text-align: left; font-weight: bold; font-size: 14px; color: #409eff;}
.switch-wrapper { width: 120px; display: flex; align-items: center; gap: 10px; }
.countdown { font-size: 12px; color: #f56c6c; }

.btn-sync { padding: 10px 20px; border-radius: 5px; cursor: pointer; border: 1px solid #ccc; width: 80px;}
.btn-danger { background-color: #f56c6c; color: white; border-color: #f56c6c; }

.switch-container { position: relative; display: inline-flex; align-items: center; }
.switch-label { margin-right: 10px; font-weight: bold; font-size: 16px;}
.switch-container input { opacity: 0; width: 0; height: 0; }
.slider { position: relative; cursor: pointer; width: 50px; height: 24px; background-color: #ccc; transition: .4s; border-radius: 24px; }
.slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
input:checked + .slider { background-color: #2196F3; }
input:checked + .slider:before { transform: translateX(26px); }
input:disabled + .slider { background-color: #e0e0e0; cursor: not-allowed; }

.tooltip-box { position: relative; }
.tooltip-box .tooltip { visibility: hidden; width: 220px; background-color: #333; color: #fff; text-align: center; padding: 6px; border-radius: 4px; position: absolute; z-index: 100; bottom: 125%; left: 50%; margin-left: -110px; opacity: 0; transition: opacity 0.3s; font-size: 12px; }
.tooltip-box:hover .tooltip, .tooltip-box input:focus + .tooltip { visibility: visible; opacity: 1; }
.disabled-area { opacity: 0.4; pointer-events: none; }

.row-5 { flex-direction: column; align-items: stretch; background-color: #fcfcfc; }
.log-title { margin: 0 0 10px 0; border-bottom: 2px solid #ddd; padding-bottom: 5px; }
.log-container { display: flex; gap: 20px; height: 200px; }
.log-box { flex: 1; border: 1px solid #e0e0e0; border-radius: 4px; display: flex; flex-direction: column; background: #fff;}
.log-box h4 { margin: 0; padding: 10px; background: #f0f2f5; font-size: 14px; border-bottom: 1px solid #e0e0e0; color: #555; text-align: center;}
.log-content { flex: 1; padding: 10px; overflow-y: auto; font-size: 13px; color: #444; }
.log-item { border-bottom: 1px dashed #eee; padding: 6px 0; word-break: break-all;}
.log-item:last-child { border-bottom: none; }
.hex-box { flex: 1; }
.hex-content { padding: 15px; font-family: 'Courier New', Courier, monospace; color: #0066cc; font-weight: bold; word-break: break-all; font-size: 14px; }
/* 脉冲与单次控制内部 Tab 样式 */
.pulse-tabs {
  margin: 15px 0;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background-color: #fafafa;
}
.ptab-headers {
  display: flex;
  border-bottom: 1px solid #dcdfe6;
  background-color: #f5f7fa;
}
.ptab-headers span {
  flex: 1;
  text-align: center;
  padding: 6px 0;
  font-size: 13px;
  cursor: pointer;
  color: #606266;
  transition: all 0.3s;
}
.ptab-headers span:first-child {
  border-right: 1px solid #dcdfe6;
}
.ptab-headers span:hover {
  color: #409eff;
}
.ptab-headers span.active {
  background-color: #fff;
  color: #409eff;
  font-weight: bold;
  border-bottom: 2px solid #409eff;
}
.ptab-content {
  padding: 10px;
  background-color: #fff;
}
</style>