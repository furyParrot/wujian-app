<template>
  <div class="app-container">
    <!-- 上栏：随高度自动缩放 -->
    <div class="top-pane">
      <!-- 左列：监控区 (固定宽度 350) -->
      <div class="left-col">
        <div class="monitor-top">
          <div class="conn-row">
            <span class="lbl">串口连接:</span>
            <select class="sel-port" v-model="selectedPort" :disabled="isConnected" @click="refreshPorts">
              <option v-for="p in availablePorts" :key="p" :value="p">{{ p }}</option>
            </select>
            <button class="btn" :class="isConnected ? 'btn-danger' : 'btn-primary'" @click="toggleConnection">
              {{ isConnected ? '断开' : '连接' }}
            </button>
          </div>
          <div class="uptime-row">
            <span class="lbl">设备开机时间:</span>
            <span class="uptime-val">{{ uptime }} s</span>
          </div>
        </div>

        <div class="monitor-bottom">
          <div class="gauge-row">
            <!-- 第一个：增加 volt-box -->
            <div class="gauge-box volt-box">
              <span class="gtit">输入电压</span>
              <div ref="chartVin" class="chart"></div>
              <span class="gval">{{ sysInVoltage.toFixed(1) }} V</span>
            </div>
            <!-- 第二个：增加 temp-box -->
            <div class="gauge-box temp-box">
              <span class="gtit">T1</span>
              <div class="thermo-track"><div class="thermo-fill" :style="{height: getTempH(temp1)}"></div></div>
              <span class="gval">{{ temp1.toFixed(1) }} ℃</span>
            </div>
            <!-- 第三个：增加 temp-box -->
            <div class="gauge-box temp-box">
              <span class="gtit">T2</span>
              <div class="thermo-track"><div class="thermo-fill" :style="{height: getTempH(temp2)}"></div></div>
              <span class="gval">{{ temp2.toFixed(1) }} ℃</span>
            </div>
          </div>
          <div class="wave-row">
            <div class="wave-box">
              <span class="wtit">通道1外触发</span>
              <div ref="chartW1" class="w-chart"></div>
            </div>
            <div class="wave-box">
              <span class="wtit">通道2外触发</span>
              <div ref="chartW2" class="w-chart"></div>
            </div>
          </div>
<!-- 新增：两行 DAC 实时计算数据显示区 -->
          <div class="dac-row">
            <div class="dac-item"><span>CH1 VSET:</span> <span class="dac-val">{{ vset1Val }} (0x{{ vset1Val.toString(16).toUpperCase().padStart(4, '0') }}) / {{ (19.4 - 4.54 * (vset1Val/65535*3.3)).toFixed(2) }}V</span></div>
            <div class="dac-item"><span>CH2 VSET:</span> <span class="dac-val">{{ vset2Val }} (0x{{ vset2Val.toString(16).toUpperCase().padStart(4, '0') }}) / {{ (19.4 - 4.54 * (vset2Val/65535*3.3)).toFixed(2) }}V</span></div>
          </div>
          <div class="dac-row">
            <div class="dac-item"><span>CH1 ISET:</span> <span class="dac-val">{{ iset1Val }} (0x{{ iset1Val.toString(16).toUpperCase().padStart(4, '0') }}) / {{ dac2a(iset1Val).toFixed(2) }}A</span></div>
            <div class="dac-item"><span>CH2 ISET:</span> <span class="dac-val">{{ iset2Val }} (0x{{ iset2Val.toString(16).toUpperCase().padStart(4, '0') }}) / {{ dac2a(iset2Val).toFixed(2) }}A</span></div>
          </div>

        </div>
      </div>

      <!-- 右列：控制区 (自适应宽度) -->
      <div class="right-col">
        <div class="control-top">
          <span class="main-sw-lbl">强电总开关</span>
          <label class="switch">
            <input type="checkbox" v-model="mainPowerSwitch" @change="onMainPowerChange" :disabled="!isConnected">
            <span class="slider green-red"></span>
          </label>
          <!-- 新增：清除报警按钮，仅在故障发生时显示 -->
          <button v-if="faultCode !== 0" class="btn btn-danger" style="margin-left: 20px; padding: 2px 10px;" @click="clearFault">
            清除报警
          </button>
          <span style="color:red; font-size:12px; margin-left:10px;">{{ parseFaultMsg(faultCode) }}</span>
        </div>

        <div class="control-bottom" :class="{ 'disabled-area': !mainPowerSwitch || !isConnected || (faultCode & 0x3F) !== 0 }">
          <!-- CH1 区域 -->
          <div class="ch-col">
            <div class="ch-sec1">
              <span class="ch-tit">CH1</span>
              <div class="indicator" :class="ch1.remainMs > 0 ? 'green' : 'red'"></div>
              <span class="ch-remain" :class="{ 'hidden': ch1.remainMs === 0 }">剩余 {{ (ch1.remainMs / 1000).toFixed(3)
                }}s</span>
            </div>

            <div class="ch-sec2">
              <div class="readings">
                <div class="r-blk"><span class="r-lbl">实时电流:</span> <span class="r-val">{{ ch1.rI.toFixed(2) }}A</span>
                </div>
                <div class="r-blk"><span class="r-lbl">通道电压:</span> <span class="r-val">{{ ch1.rV.toFixed(2) }}V</span>
                </div>
                <div class="r-blk"><span class="r-lbl">漏极电压:</span> <span class="r-val">{{ ch1.rVd.toFixed(2) }}V</span>
                </div>
              </div>
              <div class="actions">
                <div class="a-left">
                  <span class="lbl">使能外触发</span>
                  <label class="switch small"><input type="checkbox" v-model="ch1.extEn" @change="setExt(1)"><span
                      class="slider"></span></label>
                </div>
                <div class="a-right">
                  <button class="btn btn-start" @click="startCh(1)" :disabled="ch1.remainMs > 0">开始</button>
                  <button class="btn btn-stop" @click="stopCh(1)" :disabled="ch1.remainMs === 0">停止</button>
                </div>
              </div>
            </div>

            <div class="ch-sec3 custom-scroll">
              <!-- 负载参数 -->
              <div class="param-block">
                <div class="v-txt">负载参数</div>
                <div class="p-content">
                  <div class="p-row">
                    <span class="p-lbl">电流上限(A):</span>
                    <input class="p-in" type="number" v-model.lazy="ch1.limitA" @change="updateLimit(1)"
                      title="范围:0.1 - 3.0A">
                  </div>
                  <div class="p-row">
                    <span class="p-lbl">VDS电压余量(V):</span>
                    <input class="p-in" type="number" v-model.lazy="ch1.vMargin" @change="updateMargin(1)"
                      title="范围:0.5 - 3.0V">
                  </div>
                  <div class="p-row curve-row">
                    <span class="p-lbl">VI曲线:</span>
                    <div ref="chartC1" class="c-chart"></div>
                    <button class="btn btn-calib" @click="doCalib(1)" :disabled="isCalibrating1">{{ isCalibrating1 ? '校准中...' : '一键校准' }}</button>
                  </div>
                </div>
              </div>
              <!-- 输出波形设置 -->
              <div class="param-block">
                <div class="v-txt">输出波形设置</div>
                <div class="p-content">
                  <div class="p-row">
                    <span class="p-lbl">电流设置(A):</span>
                    <input class="p-in" type="number" v-model.lazy="ch1.setA" @change="updateSetA(1)">
                  </div>
                  <div class="p-row">
                    <span class="p-lbl">输出时长(S):</span>
                    <input class="p-in" type="number" v-model.lazy="ch1.setS" @change="updateSetS(1)"
                      title="0.1 - 10000000">
                  </div>
                  <div class="p-box">
                    <div class="p-row">
                      <span class="p-lbl">恒流模式</span>
                      <label class="switch small"><input type="checkbox" v-model="ch1.isPulse"
                          @change="updateMode(1)"><span class="slider"></span></label>
                      <span class="p-lbl" style="margin-left:5px">脉冲模式</span>
                    </div>
                    <div class="p-row">
                      <span class="p-lbl">频率(Hz):</span>
                      <input class="p-in" type="number" v-model.lazy="ch1.hz" @change="updatePulse(1)" title="4 - 20Hz" :disabled="!ch1.isPulse">
                    </div>
                    <div class="p-row">
                      <span class="p-lbl">占空比(%):</span>
                      <input type="range" class="p-slider" min="10" max="90" v-model="ch1.duty"
                        @change="updatePulse(1)" :disabled="!ch1.isPulse">
                      <span style="font-size:12px; margin-left:5px" :class="{'disabled-txt': !ch1.isPulse}">{{ ch1.duty }}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- CH2 区域 -->
          <div class="ch-col">
            <div class="ch-sec1">
              <span class="ch-tit">CH2</span>
              <div class="indicator" :class="ch2.remainMs > 0 ? 'green' : 'red'"></div>
              <span class="ch-remain" :class="{ 'hidden': ch2.remainMs === 0 }">剩余 {{ (ch2.remainMs / 1000).toFixed(3)
                }}s</span>
            </div>

            <div class="ch-sec2">
              <div class="readings">
                <div class="r-blk"><span class="r-lbl">实时电流:</span> <span class="r-val">{{ ch2.rI.toFixed(2) }}A</span>
                </div>
                <div class="r-blk"><span class="r-lbl">通道电压:</span> <span class="r-val">{{ ch2.rV.toFixed(2) }}V</span>
                </div>
                <div class="r-blk"><span class="r-lbl">漏极电压:</span> <span class="r-val">{{ ch2.rVd.toFixed(2) }}V</span>
                </div>
              </div>
              <div class="actions">
                <div class="a-left">
                  <span class="lbl">使能外触发</span>
                  <label class="switch small"><input type="checkbox" v-model="ch2.extEn" @change="setExt(2)"><span
                      class="slider"></span></label>
                </div>
                <div class="a-right">
                  <div style="display:flex; align-items:center; gap:5px">
                    <!-- 开始按钮：跟随打开，或者正在运行中时，按钮变灰 -->
                    <button class="btn btn-start" @click="startCh(2)" :disabled="ch2.folSt || ch2.remainMs > 0">开始</button>
                    <label class="switch very-small"><input type="checkbox" v-model="ch2.folSt"><span
                        class="slider"></span></label> 跟随CH1
                  </div>
                  <div style="display:flex; align-items:center; gap:5px; margin-top:5px">
                    <!-- 停止按钮：跟随打开，或者已经停止时，按钮变灰 -->
                    <button class="btn btn-stop" @click="stopCh(2)" :disabled="ch2.folSp || ch2.remainMs === 0">停止</button>
                    <label class="switch very-small"><input type="checkbox" v-model="ch2.folSp"><span
                        class="slider"></span></label> 跟随CH1
                  </div>
                </div>
              </div>
            </div>

            <div class="ch-sec3 custom-scroll">
              <div class="param-block">
                <div class="v-txt">负载参数</div>
                <div class="p-content">
                  <div class="p-row">
                    <span class="p-lbl">电流上限(A):</span>
                    <input class="p-in" type="number" v-model.lazy="ch2.limitA" @change="updateLimit(2)">
                  </div>
                  <div class="p-row">
                    <span class="p-lbl">VDS电压余量(V):</span>
                    <input class="p-in" type="number" v-model.lazy="ch2.vMargin" @change="updateMargin(2)">
                  </div>
                  <div class="p-row curve-row">
                    <span class="p-lbl">VI曲线:</span>
                    <div ref="chartC2" class="c-chart"></div>
                    <button class="btn btn-calib" @click="doCalib(2)" :disabled="isCalibrating2">{{ isCalibrating2 ? '校准中...' : '一键校准' }}</button>
                  </div>
                </div>
              </div>
              <div class="param-block">
                <div class="v-txt">输出波形设置</div>
                <div class="p-content">
                  <div class="p-row">
                    <span class="p-lbl">电流设置(A):</span>
                    <input class="p-in" type="number" v-model.lazy="ch2.setA" @change="updateSetA(2)">
                  </div>
                  <div class="p-row">
                    <span class="p-lbl">输出时长(S):</span>
                    <input class="p-in" type="number" v-model.lazy="ch2.setS" @change="updateSetS(2)">
                  </div>
                  <div class="p-box">
                    <div class="p-row">
                      <span class="p-lbl">恒流模式</span>
                      <label class="switch small"><input type="checkbox" v-model="ch2.isPulse"
                          @change="updateMode(2)"><span class="slider"></span></label>
                      <span class="p-lbl" style="margin-left:5px">脉冲模式</span>
                    </div>
                    <div class="p-row">
                      <span class="p-lbl">频率(Hz):</span>
                      <input class="p-in" type="number" v-model.lazy="ch2.hz" @change="updatePulse(2)" :disabled="!ch2.isPulse">
                    </div>
                    <div class="p-row">
                      <span class="p-lbl">占空比(%):</span>
                      <input type="range" class="p-slider" min="10" max="90" v-model="ch2.duty"
                        @change="updatePulse(2)" :disabled="!ch2.isPulse">
                      <span style="font-size:12px; margin-left:5px" :class="{'disabled-txt': !ch2.isPulse}">{{ ch2.duty }}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 下栏：固定高度 180 -->
    <div class="bottom-pane">
      <div class="log-col">
        <div class="l-tit">【关键操作记录】</div>
        <div class="l-content custom-scroll">
          <div v-for="(lg, i) in logs" :key="i" class="l-item">{{ lg }}</div>
        </div>
        <div class="l-btns">
          <button class="btn" @click="logs = []">清空日志</button>
          <button class="btn btn-primary" @click="saveLog">保存</button>
        </div>
      </div>
      <div class="log-col">
        <div class="l-tit">【最新发送数据(TX)】</div>
        <div class="l-content hex-txt">{{ latestTx || '暂无数据' }}</div>
      </div>
      <div class="log-col">
        <div class="l-tit">【最新接收数据(RX)】</div>
        <div class="l-content hex-txt">{{ latestRx || '暂无数据' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, onBeforeUnmount, computed } from 'vue'
import * as echarts from 'echarts'

const availablePorts = ref([])
const selectedPort = ref('')
const isConnected = ref(false)
const uptime = ref(0)
const sysInVoltage = ref(0)
const temp1 = ref(0), temp2 = ref(0)
const mainPowerSwitch = ref(false)
const faultCode = ref(0), warnCode = ref(0)

const ch1 = reactive({ remainMs: 0, rI: 0, rV: 0, rVd: 0, extEn: false, limitA: 1.0, vMargin: 1.0, setA: 0.1, setS: 0.1, isPulse: false, hz: 10, duty: 30 })
const ch2 = reactive({ remainMs: 0, rI: 0, rV: 0, rVd: 0, extEn: false, limitA: 1.0, vMargin: 1.0, setA: 0.1, setS: 0.1, isPulse: false, hz: 10, duty: 30, folSt: false, folSp: false })

const logs = ref([])
const latestTx = ref(''), latestRx = ref('')

const chartVin = ref(null), chartW1 = ref(null), chartW2 = ref(null), chartC1 = ref(null), chartC2 = ref(null)
let eCVin, eCW1, eCW2, eCC1, eCC2
let w1Data = Array(50).fill(0), w2Data = Array(50).fill(0)
let curve1Data = [], curve2Data = []
const curve1Raw = ref([]); // 新增：保存单片机原始的 ADC-DAC 节点
const curve2Raw = ref([]); // 新增：保存单片机原始的 ADC-DAC 节点
const isCalibrating1 = ref(false)
const isCalibrating2 = ref(false)
let rxBuffer = []
let loopTimer = null, uiTimer = null
let resolveSync = null, pendingVerifies = []

// 工具换算
const NTC_TABLE = [[-40, 187.52], [-39, 177.56], [-38, 168.19], [-37, 159.38], [-36, 151.09], [-35, 143.29], [-34, 135.94], [-33, 129.02], [-32, 122.51], [-31, 116.36], [-30, 110.57], [-29, 105.1], [-28, 99.95], [-27, 95.07], [-26, 90.47], [-25, 86.13], [-24, 82.01], [-23, 78.12], [-22, 74.44], [-21, 70.95], [-20, 67.64], [-19, 64.51], [-18, 61.53], [-17, 58.71], [-16, 56.03], [-15, 53.49], [-14, 51.07], [-13, 48.78], [-12, 46.59], [-11, 44.52], [-10, 42.54], [-9, 40.66], [-8, 38.88], [-7, 37.17], [-6, 35.56], [-5, 34.01], [-4, 32.55], [-3, 31.15], [-2, 29.82], [-1, 28.55], [0, 27.35], [1, 26.2], [2, 25.1], [3, 24.06], [4, 23.07], [5, 22.12], [6, 21.21], [7, 20.35], [8, 19.52], [9, 18.73], [10, 17.98], [11, 17.25], [12, 16.64], [13, 16.06], [14, 15.49], [15, 14.95], [16, 14.42], [17, 13.91], [18, 13.42], [19, 12.95], [20, 12.5], [21, 12.06], [22, 11.63], [23, 11.22], [24, 10.83], [25, 10.45], [26, 10.08], [27, 9.73], [28, 9.38], [29, 9.05], [30, 8.74], [31, 8.43], [32, 8.13], [33, 7.85], [34, 7.57], [35, 7.3], [36, 7.05], [37, 6.8], [38, 6.56], [39, 6.33], [40, 6.11], [41, 5.89], [42, 5.69], [43, 5.49], [44, 5.29], [45, 5.11], [46, 4.93], [47, 4.75], [48, 4.59], [49, 4.43], [50, 4.27], [51, 4.12], [52, 3.97], [53, 3.83], [54, 3.7], [55, 3.57], [56, 3.44], [57, 3.32], [58, 3.21], [59, 3.09], [60, 2.98], [61, 2.88], [62, 2.78], [63, 2.68], [64, 2.59], [65, 2.5], [66, 2.4], [67, 2.319], [68, 2.248], [69, 2.185], [70, 2.126], [71, 2.069], [72, 2.013], [73, 1.957], [74, 1.901], [75, 1.845], [76, 1.789], [77, 1.735], [78, 1.686], [79, 1.644], [80, 1.612], [81, 1.5541], [82, 1.5191], [83, 1.4864], [84, 1.4557], [85, 1.4269], [86, 1.4], [87, 1.3749], [88, 1.3514], [89, 1.3295], [90, 1.309]];
function adcToTemp(adc) {
  if (adc <= 0) return -50; if (adc >= 4095) return 120;
  let rt = (10 * adc) / (4095 - adc);
  if (rt >= NTC_TABLE[0][1]) return NTC_TABLE[0][0];
  if (rt <= NTC_TABLE[NTC_TABLE.length - 1][1]) return NTC_TABLE[NTC_TABLE.length - 1][0];
  for (let i = 0; i < NTC_TABLE.length - 1; i++) {
    if (rt <= NTC_TABLE[i][1] && rt >= NTC_TABLE[i + 1][1]) {
      return NTC_TABLE[i][0] + ((NTC_TABLE[i][1] - rt) / (NTC_TABLE[i][1] - NTC_TABLE[i + 1][1])) * (NTC_TABLE[i + 1][0] - NTC_TABLE[i][0]);
    }
  } return 0;
}
const getTempH = (t) => Math.max(0, Math.min(100, ((t + 50) / 170) * 100)) + '%'
const formatHex = (arr) => Array.from(arr).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
// === 新增：故障码解析函数 ===
const parseFaultMsg = (code) => {
  if (code === 0) return '';
  let msgs =[];
  if (code & (1<<0)) msgs.push('温度传感器1温度过高');
  if (code & (1<<1)) msgs.push('温度传感器1温度过低');
  if (code & (1<<2)) msgs.push('温度传感器2温度过高');
  if (code & (1<<3)) msgs.push('温度传感器2温度过低');
  if (code & (1<<4)) msgs.push('输入电压过高');
  if (code & (1<<5)) msgs.push('输入电压过低');
  if (code & (1<<6)) msgs.push('CH1电路故障(压差异常)');
  if (code & (1<<7)) msgs.push('CH2电路故障(压差异常)');
  return msgs.join(' | ');
}
const addLog = (msg, pkt = null) => {
  const t = new Date(); const ts = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`;
  logs.value.unshift(`[${ts}] ${msg}` + (pkt ? ` | ${formatHex(pkt)}` : ''));
  if (logs.value.length > 100) logs.value.pop();
}

const sendSerialData = (arr) => { latestTx.value = formatHex(arr); window.electronAPI.sendData(arr); }
const getU16 = (arr, i) => (arr[i] | (arr[i + 1] << 8)) >>> 0
const getU32 = (arr, i) => (arr[i] | (arr[i + 1] << 8) | (arr[i + 2] << 16) | (arr[i + 3] << 24)) >>> 0
const setU16 = (val) => [val & 0xFF, (val >> 8) & 0xFF]
const setU32 = (val) => [val & 0xFF, (val >> 8) & 0xFF, (val >> 16) & 0xFF, (val >> 24) & 0xFF]

// 1V对应1A => 1A对应ADC: 1240.9
const a2adc = (a) => Math.round((a / 3.3) * 4095)
const adc2a = (adc) => (adc / 4095) * 3.3
const a2dac = (a) => a2adc(a) << 4
const dac2a = (dac) => adc2a(dac >> 4)

function buildPkt(op, page, addr, arr = []) {
  const len = Math.max(1, arr.length); if (arr.length === 0) arr = Array(len).fill(0);
  const pkt = [0x5A, 0x5A, op, len, page, addr & 0xFF, (addr >> 8) & 0xFF, ...arr];
  let sum = 0; for (let i = 2; i < pkt.length; i++) sum += pkt[i];
  pkt.push(sum & 0xFF); return new Uint8Array(pkt);
}

const validate = (val, min, max, dft) => { let n = Number(val); if (isNaN(n)) n = dft; if (n < min) n = min; if (n > max) n = max; return n; }

const refreshPorts = async () => {
  if (isConnected.value) return;
  const p = await window.electronAPI.getPorts();
  availablePorts.value = p.filter(x => x.toLowerCase().includes('usb') || x.toLowerCase().includes('com'));
  if (availablePorts.value.length > 0 && !availablePorts.value.includes(selectedPort.value)) selectedPort.value = availablePorts.value[0];
}

onMounted(async () => {
  await refreshPorts()
  initCharts()
  window.addEventListener('resize', resizeCharts)

  window.electronAPI.onData((data) => {
    rxBuffer.push(...data)
    while (rxBuffer.length >= 9) {
      if (rxBuffer[0] === 0x5A && rxBuffer[1] === 0x5A) {
        let opLen = rxBuffer[3]; let eLen = 8 + opLen;
        if (rxBuffer.length >= eLen) {
          let pkt = rxBuffer.splice(0, eLen);
          latestRx.value = formatHex(pkt);
          parsePkt(pkt);
        } else break;
      } else rxBuffer.shift();
    }
  })
})
onBeforeUnmount(() => { window.removeEventListener('resize', resizeCharts) })

const toggleConnection = async () => {
  if (isConnected.value) {
    await window.electronAPI.connectPort(selectedPort.value, false);
    isConnected.value = false; clearInterval(loopTimer); clearInterval(uiTimer); addLog(`已断开连接`);
  } else {
    if (!selectedPort.value) return;
    const ok = await window.electronAPI.connectPort(selectedPort.value, true);
    if (!ok) return addLog(`连接失败`);

    addLog(`校验设备合法性...`); sendSerialData(buildPkt(0x01, 2, 0, Array(4).fill(0)));
    try {
      const auth = await new Promise((res, rej) => { pendingVerifies.push({ p: 2, a: 0, res }); setTimeout(() => rej(), 3000) });
      if (getU32(auth, 0) !== 0xABCD) throw new Error('ID');
      addLog(`同步设备参数...`);
      sendSerialData(buildPkt(0x01, 0, 0, Array(37).fill(0)));
      const p0 = await new Promise((res, rej) => { pendingVerifies.push({ p: 0, a: 0, res }); setTimeout(() => rej(), 3000) });
      sendSerialData(buildPkt(0x01, 3, 0, Array(164).fill(0)));
      const p3 = await new Promise((res, rej) => { pendingVerifies.push({ p: 3, a: 0, res }); setTimeout(() => rej(), 3000) });

      parseP0P3(p0, p3); addLog(`同步成功，启动50Hz轮询`);
      isConnected.value = true;
      loopTimer = setInterval(() => sendSerialData(buildPkt(0x01, 2, 0, Array(40).fill(0))), 20); // 50Hz
      uiTimer = setInterval(renderUI, 50); // 20Hz UI
    } catch (e) { window.electronAPI.connectPort(selectedPort.value, false); addLog(`初始化失败, 已断开`); }
  }
}

function parseP0P3(p0, p3) {
  mainPowerSwitch.value = p0[0] !== 0;
  ch1.extEn = p0[1] !== 0; ch1.setA = Number(dac2a(getU16(p0,2)).toFixed(2));
  ch1.setS = getU32(p0,6)/1000; ch1.isPulse = p0[10]!==0;
  
  // 加入除零防崩保护
  let p11 = getU32(p0,11); ch1.hz = p11 ? Math.round(1000000 / p11) : 10;
  let p15 = getU32(p0,15); ch1.duty = p11 ? Math.round(p15 / p11 * 100) : 30;
  if (!isFinite(ch1.hz) || isNaN(ch1.hz)) ch1.hz = 10;
  if (!isFinite(ch1.duty) || isNaN(ch1.duty)) ch1.duty = 30;

  ch2.extEn = p0[19] !== 0; ch2.setA = Number(dac2a(getU16(p0,20)).toFixed(2));
  ch2.setS = getU32(p0,24)/1000; ch2.isPulse = p0[28]!==0;
  
  // 加入除零防崩保护
  let p29 = getU32(p0,29); ch2.hz = p29 ? Math.round(1000000 / p29) : 10;
  let p33 = getU32(p0,33); ch2.duty = p29 ? Math.round(p33 / p29 * 100) : 30;
  if (!isFinite(ch2.hz) || isNaN(ch2.hz)) ch2.hz = 10;
  if (!isFinite(ch2.duty) || isNaN(ch2.duty)) ch2.duty = 30;

  ch1.vMargin = getU16(p3,0)/1000; ch1.limitA = Number(adc2a(getU16(p3,78)).toFixed(2));
  ch2.vMargin = getU16(p3,82)/1000; ch2.limitA = Number(adc2a(getU16(p3,160)).toFixed(2));
  
  parseCurve(p3, 2, curve1Data, curve1Raw); 
  parseCurve(p3, 84, curve2Data, curve2Raw);
}

function parseCurve(p3, base, outArr, rawRef) {
  outArr.length = 0;
  let tempRaw =[];
  for(let i=0; i<20; i++) {
    let iAdc = getU16(p3, base + i*4); 
    let vDac = getU16(p3, base + i*4 + 2);
    let a = adc2a(iAdc); 
    let v = 19.4 - 4.54 * (vDac/65535*3.3);
    outArr.push([a.toFixed(2), v.toFixed(2)]);
    tempRaw.push({ i: iAdc, v: vDac });
  }
  rawRef.value = tempRaw;
}

function parsePkt(pkt) {
  let pg = pkt[4], addr = pkt[5] | (pkt[6] << 8), data = pkt.slice(7, 7 + pkt[3]);
  if (pg === 2 && addr === 0 && data.length >= 40) { // 50Hz 轮询返回
    w1Data.shift(); w1Data.push(data[38] !== 0 ? 1 : 0);
    w2Data.shift(); w2Data.push(data[39] !== 0 ? 1 : 0);

    uptime.value = getU32(data, 4);
    sysInVoltage.value = (getU16(data, 12) / 4095 * 3.3) * 11;

    ch1.rI = (getU16(data, 14) / 4095 * 3.3); ch1.rV = (getU16(data, 16) / 4095 * 3.3) * 11; ch1.rVd = (getU16(data, 18) / 4095 * 3.3);
    ch1.remainMs = getU32(data, 20);

    ch2.rI = (getU16(data, 24) / 4095 * 3.3); ch2.rV = (getU16(data, 26) / 4095 * 3.3) * 11; ch2.rVd = (getU16(data, 28) / 4095 * 3.3);
    ch2.remainMs = getU32(data, 30);

    temp1.value = adcToTemp(getU16(data, 34)); temp2.value = adcToTemp(getU16(data, 36));

    let f = data[8], w = data[11];
    if(f !== faultCode.value) { 
      faultCode.value = f; 
      let fatal = f & 0x3F; // Bit0-5 是致命
      let warnV = f & 0xC0; // Bit6-7 是压差警告
      if(fatal !== 0) addLog(`【致命故障】(${parseFaultMsg(fatal)})`); 
      if(warnV !== 0) addLog(`【注意】(${parseFaultMsg(warnV)})`); // 降级为注意
    }
    if(w !== warnCode.value) { 
      warnCode.value = w; 
      if(w & (1<<0)) addLog(`【警告】CH1未接负载`); 
      if(w & (1<<1)) addLog(`【警告】CH2未接负载`); 
    }
    if((f & 0x3F) !== 0) mainPowerSwitch.value = false;
  } else {
    let idx = pendingVerifies.findIndex(x => x.p === pg && x.a === addr);
    if (idx !== -1) pendingVerifies.splice(idx, 1)[0].res(data);
  }
}

// === 从这里开始替换 ===

// 基础的直接发送函数 (用于不需要UI回滚的触发类指令, 如开始/停止)
const writeP = (pg, addr, arr) => sendSerialData(buildPkt(0x00, pg, addr, arr))

// 强制同步指定页面的参数 (用于校验失败时的暴力回滚 UI)
const forceSyncPage = async (pg) => {
  if (pg === 0) {
    sendSerialData(buildPkt(0x01, 0, 0, Array(37).fill(0)));
    try {
      const p0 = await new Promise((res, rej) => { pendingVerifies.push({p:0, a:0, res}); setTimeout(rej, 1000) });
      mainPowerSwitch.value = p0[0] !== 0;
      ch1.extEn = p0[1] !== 0; ch1.setA = Number(dac2a(getU16(p0,2)).toFixed(2));
      ch1.setS = getU32(p0,6)/1000; ch1.isPulse = p0[10]!==0;
      ch1.hz = Math.round(1000000 / getU32(p0,11)); ch1.duty = Math.round(getU32(p0,15) / getU32(p0,11) * 100);
      ch2.extEn = p0[19] !== 0; ch2.setA = Number(dac2a(getU16(p0,20)).toFixed(2));
      ch2.setS = getU32(p0,24)/1000; ch2.isPulse = p0[28]!==0;
      ch2.hz = Math.round(1000000 / getU32(p0,29)); ch2.duty = Math.round(getU32(p0,33) / getU32(p0,29) * 100);
      addLog(`【UI恢复】控制参数已从下位机重载`);
    } catch(e) { addLog(`【致命】控制参数重载失败，通讯可能异常`); }
  } else if (pg === 3) {
    sendSerialData(buildPkt(0x01, 3, 0, Array(164).fill(0)));
    try {
      const p3 = await new Promise((res, rej) => { pendingVerifies.push({p:3, a:0, res}); setTimeout(rej, 1000) });
      ch1.vMargin = getU16(p3,0)/1000; ch1.limitA = Number(adc2a(getU16(p3,78)).toFixed(2));
      ch2.vMargin = getU16(p3,82)/1000; ch2.limitA = Number(adc2a(getU16(p3,160)).toFixed(2));
      addLog(`【UI恢复】负载参数已从下位机重载`);
    } catch(e) { addLog(`【致命】负载参数重载失败`); }
  }
}

// 写入并回读校验，如果失败则触发 UI 回滚
const writePAndVerify = async (pg, addr, arr, logName) => {
  // 1. 发送写指令
  writeP(pg, addr, arr);
  
  // 2. 等待单片机 EEPROM 保存完成 (给足 100ms 宽裕时间)
  await new Promise(r => setTimeout(r, 100));

  // 3. 发起回读请求
  sendSerialData(buildPkt(0x01, pg, addr, Array(arr.length).fill(0)));

  try {
    const readData = await new Promise((res, rej) => { 
      pendingVerifies.push({p:pg, a:addr, res}); 
      setTimeout(rej, 1500); // 1500ms 超时
    });

    // 4. 逐字节比对
    let match = true;
    for(let i=0; i<arr.length; i++) {
      if(readData[i] !== arr[i]) match = false;
    }

    if(match) {
      addLog(`${logName} 设置成功`);
    } else {
      addLog(`【校验失败】${logName} 数值未生效，正在回滚UI...`);
      forceSyncPage(pg); // 暴力拉取真实数据修正 UI
    }
  } catch(e) {
    addLog(`【超时】${logName} 未收到下位机确认，正在回滚UI...`);
    forceSyncPage(pg); // 暴力拉取真实数据修正 UI
  }
}

// ================= 将所有的参数修改接管为【闭环校验模式】 =================
const onMainPowerChange = () => writePAndVerify(0, 0,[mainPowerSwitch.value ? 1 : 0], '强电总开关');
const setExt = (c) => writePAndVerify(0, c===1?1:19,[c===1?ch1.extEn?1:0:ch2.extEn?1:0], `CH${c}外触发使能`);

const updateLimit = (c) => {
  let ch = c===1?ch1:ch2; ch.limitA = validate(ch.limitA, 0.1, 3.0, 1.0);
  writePAndVerify(3, c===1?78:160, setU16(a2adc(ch.limitA)), `CH${c}电流上限`);
  if(ch.setA > ch.limitA) { ch.setA = ch.limitA; updateSetA(c); }
}
const updateMargin = (c) => { 
  let ch = c===1?ch1:ch2; ch.vMargin = validate(ch.vMargin, 0.5, 3.0, 1.0); 
  writePAndVerify(3, c===1?0:82, setU16(ch.vMargin*1000), `CH${c}电压余量`); 
}
const iset1Val = computed(() => a2dac(ch1.setA));
const iset2Val = computed(() => a2dac(ch2.setA));

const calcVdac = (ch, target_idac) => {
  let target_iadc = target_idac >> 4; 
  let raw = ch === 1 ? curve1Raw.value : curve2Raw.value;
  // 如果 EEPROM 没读上来，安全起见默认输出最低电压 (65535)
  if (!raw || raw.length === 0) return 65535; 
  
  // 【核心修复】：越界钳制！绝不允许 target_iadc 跑出数组索引范围
  if (target_iadc < raw[0].i) target_iadc = raw[0].i;
  if (target_iadc > raw[19].i) target_iadc = raw[19].i;

  let margin_mv = ch === 1 ? ch1.vMargin * 1000 : ch2.vMargin * 1000;
  let dac_offset = Math.floor((margin_mv * 4369) / 1000);

  for(let i = 0; i < 19; i++) {
    let i_low = raw[i].i, v_low = raw[i].v;
    let i_high = raw[i+1].i, v_high = raw[i+1].v;
    if(target_iadc >= i_low && target_iadc <= i_high) {
      let v_calc = v_low;
      if(i_high > i_low) {
        let ratio = (target_iadc - i_low) / (i_high - i_low);
        v_calc = v_low + Math.trunc(ratio * (v_high - v_low));
      }
      if(v_calc > dac_offset) return v_calc - dac_offset;
      else return 0; // 超出物理极值，输出最大电压
    }
  }
  return 0; // 超出最大电流范围，匹配单片机 C 代码的极值策略
}

const vset1Val = computed(() => calcVdac(1, iset1Val.value));
const vset2Val = computed(() => calcVdac(2, iset2Val.value));
const updateSetA = (c) => { 
  let ch = c===1?ch1:ch2; ch.setA = validate(ch.setA, 0.1, ch.limitA, 0.1); 
  writePAndVerify(0, c===1?2:20, setU16(a2dac(ch.setA)), `CH${c}电流设置`); 
}
const updateSetS = (c) => { 
  let ch = c===1?ch1:ch2; ch.setS = validate(ch.setS, 0.1, 10000000, 0.1); 
  writePAndVerify(0, c===1?6:24, setU32(ch.setS*1000), `CH${c}输出时长`); 
}
const updateMode = (c) => writePAndVerify(0, c===1?10:28,[(c===1?ch1.isPulse:ch2.isPulse)?1:0], `CH${c}输出模式`);
const updatePulse = (c) => {
  let ch = c===1?ch1:ch2; ch.hz = validate(ch.hz, 4, 20, 10);
  let p_us = 1000000 / ch.hz; let h_us = p_us * (ch.duty / 100);
  // 脉冲的周期和高电平刚好在寄存器里是连续的 8 个字节，直接一次性合并校验！
  writePAndVerify(0, c===1?11:29, [...setU32(p_us), ...setU32(h_us)], `CH${c}脉冲参数`); 
}

const clearFault = () => { 
  writeP(1, 0, [1]); 
  addLog("下发命令：尝试清除报警..."); 
}
// (保留 Start/Stop/doCalib 的 writeP，因为它们触发动作，UI 会靠 50Hz 轮询状态自然同步)
const startCh = (c) => {
  if(c===1 && ch2.folSt) { writeP(1, 1,[1]); addLog("合控: 开始"); }
  else { writeP(1, c===1?3:6, [1]); addLog(`CH${c} 开始`); }
}
const stopCh = (c) => {
  if(c===1 && ch2.folSp) { writeP(1, 2,[1]); addLog("合控: 停止"); }
  else { writeP(1, c===1?4:7, [1]); addLog(`CH${c} 停止`); }
}
const doCalib = (c) => { writeP(1, c===1?5:8, [1]); addLog(`CH${c} 请求一键校准, 请等待几秒...`); }

// === 替换到这里结束 ===

const saveLog = async () => {
  const ok = await window.electronAPI.saveLogFile(logs.value.join('\n'));
  if (ok) alert("保存成功！");
}

// 20Hz UI 渲染
function renderUI() {
  eCVin.setOption({ series: [{ data: [{ value: sysInVoltage.value }] }] })
  eCW1.setOption({ series: [{ data: w1Data }] })
  eCW2.setOption({ series: [{ data: w2Data }] })
  eCC1.setOption({ series: [{ data: curve1Data }] })
  eCC2.setOption({ series: [{ data: curve2Data }] })
}

function initCharts() {
  eCVin = echarts.init(chartVin.value);
  eCW1 = echarts.init(chartW1.value);
  eCW2 = echarts.init(chartW2.value);
  eCC1 = echarts.init(chartC1.value);
  eCC2 = echarts.init(chartC2.value);

  // 1. 电压表：放大半径、下移中心点、刻度字向外推，解决重叠看不清的问题
  eCVin.setOption({
    series: [{
      type: 'gauge',
      min: 0, max: 30,
      radius: '100%',            // 放大表盘
      center: ['50%', '65%'],    // 中心点下移，给扇形留出空间
      startAngle: 200, endAngle: -20,
      splitNumber: 6,
      axisLine: { lineStyle: { width: 8 } },
      axisTick: { show: true, length: 5 },
      splitLine: { show: true, length: 10 },
      axisLabel: { distance: 12, fontSize: 10 }, // 刻度数字向外移
      pointer: { width: 3, length: '65%' },      // 指针变细变短
      detail: { show: false },
      data: [{ value: 0 }]
    }]
  });

  // 生成 X轴 1s (50个点) 的时间刻度文本 (-1.0s 到 0s)
  const xAxisData = Array.from({ length: 50 }, (_, i) => {
    let time = -((49 - i) * 0.02);
    return time === 0 ? '0s' : time.toFixed(1) + 's';
  });

  // 2. 波形图：修改纵坐标为 low/high，横坐标显示 1s 时间刻度
  const wOpt = { 
    animation: false, 
    grid: { left: 45, right: 15, top: 20, bottom: 25 }, 
    xAxis: { 
      type: 'category', 
      data: xAxisData,
      // 修改点 1：隐藏 X 轴刻度文字，但保留短刻度线
      axisLabel: { show: false }, 
      axisTick: { show: true, alignWithLabel: true }
    }, 
    yAxis: { 
      type: 'value', min: -0.2, max: 1.2, splitNumber: 1,
      axisLabel: {
        formatter: (v) => {
          if (v === 0) return 'low';
          if (v === 1) return 'high';
          return '';
        },
        fontSize: 11,
        fontWeight: 'bold',
        color: '#333'
      },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: '#eee' } } 
    }, 
    series:[{ 
      type: 'line', 
      step: 'end', 
      // 修改点 2：取消折线图上的小圆圈点
      symbol: 'none', 
      data: [], 
      itemStyle: { color: '#f5222d' }, 
      lineStyle: { width: 1.5 } 
    }] 
  };
  eCW1.setOption(wOpt); eCW2.setOption(wOpt);

  const cOpt = { animation: false, grid: { left: 30, right: 10, top: 10, bottom: 20 }, xAxis: { type: 'value', min: 'dataMin', max: 'dataMax', axisLabel: { fontSize: 10 } }, yAxis: { type: 'value', min: 'dataMin', max: 'dataMax', axisLabel: { fontSize: 10 } }, series: [{ type: 'line', smooth: true, data: [], itemStyle: { color: '#1890ff' } }] };
  eCC1.setOption(cOpt); eCC2.setOption(cOpt);
}
function resizeCharts() { eCVin.resize(); eCW1.resize(); eCW2.resize(); eCC1.resize(); eCC2.resize(); }
</script>

<style scoped>
/* 强制抹除 Vite 默认的 body 边距，彻底解决出现滚动条和页面抖动的问题 */
:global(body) {
  margin: 0 !important;
  padding: 0 !important;
  max-width: none !important;
  overflow: hidden !important;
}

.app-container {
  height: 100vh;
  width: 100vw;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: sans-serif;
  background: #f0f2f5;
}

.top-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 10px;
  gap: 10px;
}

.bottom-pane {
  height: 180px;
  flex-shrink: 0;
  display: flex;
  padding: 0 10px 10px 10px;
  gap: 10px;
}

/* 左侧监控区 */
.left-col {
  width: 350px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.monitor-top {
  height: 100px;
  padding: 15px;
  border-bottom: 1px solid #eee;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}

.conn-row,
.uptime-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lbl {
  font-size: 14px;
  font-weight: bold;
  color: #333;
}

.sel-port {
  width: 120px;
  padding: 4px;
  border: 1px solid #ccc;
  border-radius: 3px;
}

.btn {
  padding: 4px 12px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  color: white;
  font-size: 13px;
  font-weight: bold;
}

.btn-primary {
  background: #1890ff;
}

.btn-danger {
  background: #f5222d;
}

.btn-start {
  background: #52c41a;
}

.btn-stop {
  background: #f5222d;
}

.btn-calib {
  background: #faad14;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.uptime-val {
  font-family: monospace;
  font-size: 16px;
  color: #1890ff;
  font-weight: bold;
}

.monitor-bottom {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px;
  min-height: 0;
}

.gauge-row {
  flex: 1;
  display: flex;
  justify-content: space-around;
  min-height: 0;
}
.volt-box { flex: 2; }
.temp-box { flex: 1; }

.gauge-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* 强制分配 2:1:1 比例 */
.volt-box { flex: 2 !important; }
.temp-box { flex: 1 !important; }

.gtit {
  font-size: 13px;
  color: #555;
  font-weight: bold;
  margin-bottom: 5px;
}

.chart {
  width: 100%;
  flex: 1;
}

.gval {
  font-size: 15px;
  font-weight: bold;
  color: #1890ff;
}

.thermo-track {
  width: 14px;
  flex: 1;
  background: #eee;
  border-radius: 7px;
  margin: 5px 0;
  position: relative;
  overflow: hidden;
  border: 1px solid #ddd;
}

.thermo-fill {
  position: absolute;
  bottom: 0;
  width: 100%;
  background: linear-gradient(to top, #1890ff, #52c41a, #f5222d);
  transition: height 0.1s;
}

.wave-row {
  flex: 1;
  display: flex;
  gap: 10px;
  min-height: 0;
  margin-top: 10px;
}

.wave-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 5px;
  background: #fafafa;
}

.wtit {
  font-size: 12px;
  color: #666;
  text-align: center;
}

.w-chart {
  flex: 1;
  width: 100%;
}

/* 右侧控制区 */
.right-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  min-width: 0;
}

.control-top {
  height: 30px;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  padding: 0 15px;
  background: #f9f9f9;
  border-radius: 6px 6px 0 0;
}

.main-sw-lbl {
  font-size: 14px;
  font-weight: bold;
  color: #f5222d;
  margin-right: 15px;
}

.control-bottom {
  flex: 1;
  display: flex;
  min-height: 0;
  transition: opacity 0.3s;
}

.disabled-area {
  opacity: 0.3;
  pointer-events: none;
}

.ch-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #eee;
  min-width: 0;
}

.ch-col:last-child {
  border-right: none;
}

.ch-sec1 { 
  height: 30px; 
  display: flex; 
  align-items: center; 
  justify-content: center; /* 新增居中 */
  padding: 0 15px; 
  border-bottom: 1px solid #f0f0f0; 
  background: #fafafa; 
}

.ch-tit {
  font-weight: bold;
  margin-right: 15px;
}

.indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 10px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
}

.indicator.green {
  background: #52c41a;
}

.indicator.red {
  background: #f5222d;
}

.ch-remain {
  font-size: 13px;
  color: #52c41a;
  font-weight: bold;
}

.hidden {
  visibility: hidden;
}

.ch-sec2 {
  height: 120px;
  border-bottom: 1px solid #eee;
  padding: 10px 15px;
  display: flex;
  flex-direction: column;
}

.readings {
  height: 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f0f8ff;
  padding: 0 10px;
  border-radius: 4px;
}

.r-blk {
  font-size: 13px;
}

.r-lbl {
  color: #666;
  display: inline-block;
  width: 65px;
  text-align: right;
}

.r-val {
  font-weight: bold;
  color: #1890ff;
  /* 核心防抖属性 */
  font-variant-numeric: tabular-nums; 
  display: inline-block; 
  width: 50px; /* 固定宽度 */
  text-align: right;
}
/* ====== 禁用状态变灰 ====== */
.p-in:disabled, .p-slider:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background-color: #f5f5f5;
}
.disabled-txt {
  opacity: 0.4;
}
.actions { 
  height: 70px; 
  margin-top: 10px; 
  display: flex; 
  justify-content: space-around; /* 从 space-between 改为 space-around，向中间聚拢 */
  align-items: center; 
}

.a-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.a-right { 
  display: flex; 
  flex-direction: column; 
  align-items: center; /* 新增：让右侧内部的 开始/停止/跟随开关 整体居中对齐 */
  gap: 8px; 
}

.ch-sec3 {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.param-block {
  display: flex;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  background: #fafafa;
}

.v-txt {
  width: 30px;
  writing-mode: vertical-lr;
  text-orientation: upright;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e6f7ff;
  color: #0050b3;
  font-weight: bold;
  font-size: 13px;
  letter-spacing: 2px;
  border-radius: 4px 0 0 4px;
  border-right: 1px solid #e8e8e8;
}

.p-content {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.p-row {
  display: flex;
  align-items: center;
  justify-content: center;
}

.p-lbl {
  width: 110px;
  font-size: 12px;
  color: #333;
  text-align: right;
  margin-right: 10px;
  font-weight: bold;
}

.p-in {
  width: 100px;
  padding: 3px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 13px;
}

.curve-row {
  flex: 1;
  display: flex;
  align-items: stretch;
  min-height: 80px;
}

.c-chart {
  flex: 1;
  min-width: 0;
  background: #fff;
  border: 1px solid #eee;
  margin-right: 10px;
}

.p-box {
  border: 1px dashed #ccc;
  padding: 8px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
}

.p-slider {
  width: 100px;
}

/* 底部日志区 */
.log-col {
  flex: 1;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.l-tit {
  height: 30px;
  background: #fafafa;
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: 13px;
  font-weight: bold;
  color: #333;
  border-bottom: 1px solid #eee;
}

.l-content {
  flex: 1;
  padding: 8px;
  font-size: 12px;
  color: #555;
}

.l-item {
  margin-bottom: 4px;
  border-bottom: 1px dashed #f0f0f0;
  padding-bottom: 2px;
  word-break: break-all;
}

.hex-txt {
  font-family: monospace;
  color: #0050b3;
  word-break: break-all;
}

.l-btns {
  padding: 5px;
  display: flex;
  gap: 10px;
  border-top: 1px solid #eee;
  background: #fafafa;
}

/* Switch 开关组件 (复用你之前的设计，稍微调小) */
.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
  margin: 0 15px;
}

.switch.small {
  width: 34px;
  height: 18px;
}

.switch.very-small {
  width: 28px;
  height: 14px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .4s;
  border-radius: 20px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}

.switch.small .slider:before {
  height: 12px;
  width: 12px;
}

.switch.very-small .slider:before {
  height: 10px;
  width: 10px;
  left: 2px;
  bottom: 2px;
}

input:checked+.slider {
  background-color: #1890ff;
}

input:checked+.slider.green-red {
  background-color: #52c41a;
}

.slider.green-red {
  background-color: #f5222d;
}

input:checked+.slider:before {
  transform: translateX(20px);
}

.switch.small input:checked+.slider:before {
  transform: translateX(16px);
}

.switch.very-small input:checked+.slider:before {
  transform: translateX(14px);
}

input:disabled+.slider {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 自定义滚动条 */
.custom-scroll {
  overflow-y: auto;
}

.custom-scroll::-webkit-scrollbar {
  width: 6px;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background-color: #ccc;
  border-radius: 3px;
}

/* ====== 新增：DAC 信息栏样式 ====== */
.dac-row {
  display: flex;
  justify-content: space-around;
  align-items: center;
  min-height: 24px;
  margin-top: 6px;
  padding: 0 10px;
  font-size: 12px;
  color: #555;
  background: #f0f8ff;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
}
.dac-item {
  display: flex;
  gap: 8px;
}
.dac-val {
  font-family: monospace;
  font-weight: bold;
  color: #0050b3;
}
</style>