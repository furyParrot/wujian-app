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
        <!-- 第 1 个仪表：电压表 -->
        <div class="gauge-box">
          <span class="gauge-title">当前输入电压</span>
          <div ref="chartVoltage" class="chart"></div>
          <div class="value-text">{{ (sysInVoltage).toFixed(1) }} V</div>
        </div>
        
        <!-- 第 2 个仪表：横向温度计 1 -->
        <div class="gauge-box">
          <span class="gauge-title">热敏电阻 1</span>
          <div class="thermo-container">
            <div class="thermo-track">
              <!-- 底色是冷暖渐变，上面一层通过调整宽度来遮挡未达到的温度 -->
              <div class="thermo-gradient"></div>
              <div class="thermo-cover" :style="{ width: getThermoCoverWidth(temp1) }"></div>
            </div>
            <div class="thermo-axis">
              <span>-50</span><span>0</span><span>50</span><span>100</span><span>120</span>
            </div>
          </div>
          <div class="value-text">T1: {{ temp1.toFixed(1) }}℃</div>
        </div>

        <!-- 第 3 个仪表：横向温度计 2 -->
        <div class="gauge-box">
          <span class="gauge-title">热敏电阻 2</span>
          <div class="thermo-container">
            <div class="thermo-track">
              <div class="thermo-gradient"></div>
              <div class="thermo-cover" :style="{ width: getThermoCoverWidth(temp2) }"></div>
            </div>
            <div class="thermo-axis">
              <span>-50</span><span>0</span><span>50</span><span>100</span><span>120</span>
            </div>
          </div>
          <div class="value-text">T2: {{ temp2.toFixed(1) }}℃</div>
        </div>

        <!-- 第 4 个仪表：外触发波形 -->
        <div class="gauge-box wave-box">
          <span class="gauge-title">外触发信号</span>
          <div ref="chartWave" class="chart wave-chart"></div>
        </div>
      </div>

      <!-- 第三行：强电总开关 -->
      <div class="row row-3">
        <label class="switch-container">
          <span class="switch-label">强电总开关</span>
          <input type="checkbox" v-model="mainPowerSwitch" @change="onMainPowerChange" :disabled="!isConnected">
          <span class="slider"></span>
        </label>
      </div>

      <!-- 第四行：通道控制区 -->
      <div class="row row-4" :class="{ 'disabled-area': !mainPowerSwitch || !isConnected }">
        <!-- 通道 1 -->
        <div class="col channel-col">
          <h3 class="col-title">通道1</h3>
          <div class="control-item">
            <span class="label-text">电流设置(A):</span>
            <input class="input-elem" type="number" step="0.01" min="0" max="3" v-model.lazy="ch1.setCurr" @change="updateCh1Current">
          </div>
          <div class="control-item tooltip-box">
            <span class="label-text">单次输出(s):</span>
            <input class="input-elem" type="number" min="0" max="10000" v-model.lazy="ch1.setMaxTime" @change="updateCh1Time">
            <span class="tooltip">请输入0-10000之间的数字。将换算成ms写入page0地址4-7</span>
          </div>
          <div class="control-item">
            <span class="label-text">开关模式:</span>
            <select class="input-elem" v-model="ch1.triggerMode" @change="updateCh1Trigger">
              <option :value="0">内触发</option>
              <option :value="1">外触发</option>
            </select>
          </div>
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
        </div>

        <!-- 通道 2 -->
        <div class="col channel-col">
          <h3 class="col-title">通道2</h3>
          <div class="control-item">
            <span class="label-text">电流设置(A):</span>
            <input class="input-elem" type="number" step="0.01" min="0" max="3" v-model.lazy="ch2.setCurr" @change="updateCh2Current">
          </div>
          <div class="control-item tooltip-box">
            <span class="label-text">单次输出(s):</span>
            <input class="input-elem" type="number" min="0" max="10000" v-model.lazy="ch2.setMaxTime" @change="updateCh2Time">
            <span class="tooltip">请输入0-10000的数字...</span>
          </div>
          <div class="control-item">
            <span class="label-text">开关模式:</span>
            <select class="input-elem" v-model="ch2.triggerMode" @change="updateCh2Trigger">
              <option :value="0">内触发</option>
              <option :value="1">外触发</option>
            </select>
          </div>
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
const temp1 = ref(100)
const temp2 = ref(0)
const extTriggerHistory = reactive(Array(25).fill(0))
const mainPowerSwitch = ref(false)

const ch1 = reactive({ setCurr: 0, setMaxTime: 0, triggerMode: 0, isOn: false, countdown: 0, realCurr: 0, realVolt: 0 })
const ch2 = reactive({ setCurr: 0, setMaxTime: 0, triggerMode: 0, isOn: false, countdown: 0, realCurr: 0, realVolt: 0 })

const logs = ref([])
const latestTx = ref('')
const latestRx = ref('')

const chartVoltage = ref(null), chartWave = ref(null)
let eChartVoltage, eChartWave
let pollingTimer = null
let rxBuffer =[]

// ======================== 温度计算逻辑 (NTC 插值查表法) ========================
const NTC_TABLE = [
  [-40,187.52],[-39,177.56], [-38,168.19],[-37,159.38], [-36,151.09],[-35,143.29], [-34,135.94], [-33,129.02], [-32,122.51], [-31,116.36],[-30,110.57], [-29,105.1],[-28,99.95], [-27,95.07],[-26,90.47], [-25,86.13], [-24,82.01],[-23,78.12], [-22,74.44],[-21,70.95], [-20,67.64], [-19,64.51],[-18,61.53], [-17,58.71],[-16,56.03], [-15,53.49],[-14,51.07], [-13,48.78], [-12,46.59],[-11,44.52], [-10,42.54],[-9,40.66], [-8,38.88], [-7,37.17],[-6,35.56], [-5,34.01], [-4,32.55],[-3,31.15], [-2,29.82],[-1,28.55], [0,27.35], [1,26.2],[2,25.1], [3,24.06], [4,23.07],[5,22.12], [6,21.21], [7,20.35], [8,19.52], [9,18.73],[10,17.98], [11,17.25], [12,16.64], [13,16.06], [14,15.49],[15,14.95], [16,14.42],[17,13.91], [18,13.42], [19,12.95],[20,12.5], [21,12.06],[22,11.63], [23,11.22], [24,10.83],[25,10.45], [26,10.08],[27,9.73], [28,9.38], [29,9.05],[30,8.74], [31,8.43],[32,8.13], [33,7.85], [34,7.57],[35,7.3], [36,7.05], [37,6.8],[38,6.56], [39,6.33], [40,6.11],[41,5.89], [42,5.69],[43,5.49], [44,5.29], [45,5.11],[46,4.93], [47,4.75], [48,4.59],[49,4.43], [50,4.27],[51,4.12], [52,3.97], [53,3.83],[54,3.7], [55,3.57], [56,3.44],[57,3.32], [58,3.21],[59,3.09], [60,2.98], [61,2.88],[62,2.78], [63,2.68], [64,2.59],[65,2.5], [66,2.4], [67,2.319], [68,2.248], [69,2.185],[70,2.126], [71,2.069],[72,2.013], [73,1.957], [74,1.901],[75,1.845], [76,1.789],[77,1.735], [78,1.686], [79,1.644], [80,1.612], [81,1.5541],[82,1.5191], [83,1.4864],[84,1.4557], [85,1.4269],[86,1.4], [87,1.3749], [88,1.3514],[89,1.3295], [90,1.309]
]

function adcToTemp(adcValue) {
  // 断路或短路保护
  if (adcValue <= 0) return -50; 
  if (adcValue >= 4095) return 120;

  // 根据硬件：3.3V - 10k(R1) - ADC - NTC(Rt) - GND
  // 公式：V_ADC = 3.3 * (Rt / (10 + Rt)) => Rt = 10 * ADC / (4095 - ADC) 
  let rt = (10 * adcValue) / (4095 - adcValue);

  // 查表法找温度（表里阻值是递减的，温度递增）
  if (rt >= NTC_TABLE[0][1]) return NTC_TABLE[0][0]; // 比表里最冷的还冷
  if (rt <= NTC_TABLE[NTC_TABLE.length - 1][1]) return NTC_TABLE[NTC_TABLE.length - 1][0]; // 比最热的还热

  for (let i = 0; i < NTC_TABLE.length - 1; i++) {
    let t1 = NTC_TABLE[i][0], r1 = NTC_TABLE[i][1];
    let t2 = NTC_TABLE[i+1][0], r2 = NTC_TABLE[i+1][1];
    // 寻找区间，进行线性插值
    if (rt <= r1 && rt >= r2) {
      let fraction = (r1 - rt) / (r1 - r2);
      return t1 + fraction * (t2 - t1);
    }
  }
  return 0;
}

// 计算温度计遮罩的宽度百分比 (范围: -50 到 120, 跨度 170度)
const getThermoCoverWidth = (temp) => {
  let clamped = Math.max(-50, Math.min(120, temp));
  let pct = ((clamped + 50) / 170) * 100;
  return (100 - pct).toFixed(1) + '%';
}
// =========================================================================

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
  if (dataArr.length === 0) {
    for(let i=0; i<len; i++) dataArr.push(0x00)
  }
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
  } else if (availablePorts.value.length === 0) {
    selectedPort.value = '';
  }
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
        } else {
          break;
        }
      } else {
        rxBuffer.shift()
      }
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
    if (success) {
      addLog(`串口 ${selectedPort.value} 连接成功`)
      const authPacket = buildPacket(0x01, 2, 0, new Array(4).fill(0))
      sendSerialData(authPacket)
      addLog(`请求验证设备识别码`, authPacket) 
      
      setTimeout(() => {
        isConnected.value = true
        startPolling()
      }, 500)
    } else {
      addLog(`串口 ${selectedPort.value} 连接失败`)
    }
  }
}

function startPolling() {
  pollingTimer = setInterval(() => {
    const req = buildPacket(0x01, 2, 0, new Array(29).fill(0))
    sendSerialData(req)
  }, 200)
}

function parseIncomingPacket(packet) {
  if(packet[2] === 0x01 && packet[4] === 0x02 && packet[5] === 0x00 && packet[6] === 0x00) {
    const data = packet.slice(7, packet.length - 1)
    if(getU32(data, 0) !== 0xABCD && !isConnected.value) return;

    uptime.value = getU32(data, 4)
    sysInVoltage.value = (getU16(data, 12) / 4095 * 3.3) * 11 

    ch1.realCurr = (getU16(data, 14) / 4095 * 3.3) * 2
    ch1.realVolt = (getU16(data, 16) / 4095 * 3.3) * 11
    if(data[18] === 0) ch1.isOn = false;

    ch2.realCurr = (getU16(data, 19) / 4095 * 3.3) * 2
    ch2.realVolt = (getU16(data, 21) / 4095 * 3.3) * 11
    if(data[23] === 0) ch2.isOn = false;

    // 获取精确温度
    temp1.value = adcToTemp(getU16(data, 24))
    temp2.value = adcToTemp(getU16(data, 26))

    let extTrig = data[28] !== 0 ? 1 : 0
    extTriggerHistory.shift()
    extTriggerHistory.push(extTrig)

    updateCharts()
  }
}

const onMainPowerChange = () => {
  const p = buildPacket(0x00, 0, 0,[mainPowerSwitch.value ? 1 : 0])
  sendSerialData(p)
  addLog(mainPowerSwitch.value ? '强电总开关打开' : '强电总开关关闭', p)
}

const currToDac = (A) => Math.round(((A / 2) / 3.3) * 4095)

const updateCh1Current = () => {
  let dac = currToDac(ch1.setCurr)
  const p = buildPacket(0x00, 0, 2,[dac & 0xFF, (dac >> 8) & 0xFF])
  sendSerialData(p)
  addLog(`通道1电流设置更改为 ${ch1.setCurr}A`, p)
}
const updateCh2Current = () => {
  let dac = currToDac(ch2.setCurr)
  const p = buildPacket(0x00, 0, 9,[dac & 0xFF, (dac >> 8) & 0xFF])
  sendSerialData(p)
  addLog(`通道2电流设置更改为 ${ch2.setCurr}A`, p)
}

const updateCh1Time = () => {
  let ms = ch1.setMaxTime * 1000
  const p = buildPacket(0x00, 0, 4,[ms & 0xFF, (ms>>8)&0xFF, (ms>>16)&0xFF, (ms>>24)&0xFF])
  sendSerialData(p)
  addLog(`通道1单次输出时长更改为 ${ch1.setMaxTime}s`, p)
}
const updateCh2Time = () => {
  let ms = ch2.setMaxTime * 1000
  const p = buildPacket(0x00, 0, 11,[ms & 0xFF, (ms>>8)&0xFF, (ms>>16)&0xFF, (ms>>24)&0xFF])
  sendSerialData(p)
  addLog(`通道2单次输出时长更改为 ${ch2.setMaxTime}s`, p)
}

const updateCh1Trigger = () => {
  const p = buildPacket(0x00, 0, 1, [ch1.triggerMode])
  sendSerialData(p)
  addLog(`通道1触发模式更改为 ${ch1.triggerMode === 0 ? '内触发' : '外触发'}`, p)
}
const updateCh2Trigger = () => {
  const p = buildPacket(0x00, 0, 8,[ch2.triggerMode])
  sendSerialData(p)
  addLog(`通道2触发模式更改为 ${ch2.triggerMode === 0 ? '内触发' : '外触发'}`, p)
}

const toggleCh1 = () => {
  if(ch1.isOn) {
    const p = buildPacket(0x00, 1, 3, [1])
    sendSerialData(p)
    startCountdown(ch1)
    addLog('通道1开始输出', p)
  } else {
    const p = buildPacket(0x00, 1, 4,[1])
    sendSerialData(p)
    ch1.countdown = 0
    addLog('通道1停止输出', p)
  }
}
const toggleCh2 = () => {
  if(ch2.isOn) {
    const p = buildPacket(0x00, 1, 5, [1])
    sendSerialData(p)
    startCountdown(ch2)
    addLog('通道2开始输出', p)
  } else {
    const p = buildPacket(0x00, 1, 6, [1])
    sendSerialData(p)
    ch2.countdown = 0
    addLog('通道2停止输出', p)
  }
}

const syncOpen = () => {
  const p = buildPacket(0x00, 1, 1,[1])
  sendSerialData(p)
  ch1.isOn = true; ch2.isOn = true
  startCountdown(ch1); startCountdown(ch2)
  addLog('合控触发：双通道同开', p)
}
const syncClose = () => {
  const p = buildPacket(0x00, 1, 2, [1])
  sendSerialData(p)
  ch1.isOn = false; ch2.isOn = false
  ch1.countdown = 0; ch2.countdown = 0
  addLog('合控触发：双通道同关', p)
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
  eChartVoltage.setOption({ 
    series:[{ 
      type: 'gauge', min: 0, max: 30, splitNumber: 6, // 刻度变少，防拥挤
      axisLabel: { fontSize: 11, distance: -20 }, // 字体变小
      detail: {show: false}, 
      data: [{value: 0}], 
      axisLine: { lineStyle: { width: 10 } } 
    }]
  })
  
  eChartWave = echarts.init(chartWave.value)
  eChartWave.setOption({ 
    // 加上坐标轴边框和网格范围
    grid: { left: 25, right: 15, top: 20, bottom: 25, show: true, borderColor: '#ddd' }, 
    xAxis: { 
      type: 'category', show: true, 
      axisLabel: { show: false }, // X轴不显示字，只显示线框
      axisTick: { show: false } 
    }, 
    yAxis: { 
      type: 'value', min: -0.3, max: 1.3, show: true, 
      splitLine: { show: true, lineStyle: { type: 'dashed' } },
      axisLabel: { fontSize: 10 } 
    }, 
    series:[{ 
      type: 'line', step: 'start', data: extTriggerHistory, 
      itemStyle: {color: '#409eff'}, areaStyle: { color: 'rgba(64,158,255,0.1)' } 
    }] 
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

/* ===== 自定义横排温度计 CSS ===== */
.thermo-container { width: 90%; flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; }
.thermo-track { position: relative; width: 100%; height: 18px; border-radius: 9px; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); background-color: #f0f0f0;}
.thermo-gradient { position: absolute; left: 0; top: 0; width: 100%; height: 100%; background: linear-gradient(to right, #1890ff 0%, #52c41a 30%, #faad14 60%, #f5222d 100%); }
.thermo-cover { position: absolute; right: 0; top: 0; height: 100%; background: #e0e0e0; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); border-left: 2px solid #fff;}
.thermo-axis { display: flex; justify-content: space-between; width: 100%; font-size: 11px; color: #666; margin-top: 5px; }
/* ================================= */

.row-3 { justify-content: center; background-color: #fafafa; }
.row-4 { align-items: stretch; }
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
</style>