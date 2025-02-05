import 'reflect-metadata'

import * as path from 'path'
import { FixDefinitions } from '../../dictionary/definition'
import { MsgView } from '../../buffer'
import { AsciiView } from '../../buffer/ascii'
import { ILooseObject } from '../../collections/collection'
import { FixMsgMemoryStore, FixMsgStoreRecord, IFixMsgStore, IFixMsgStoreRecord } from '../../store'
import { MsgTag } from '../../types'
import { Setup } from '../env/setup'

const root: string = path.join(__dirname, '../../../data')

let definitions: FixDefinitions
let views: MsgView[]
let expected: ILooseObject
let store: IFixMsgStore
let records: IFixMsgStoreRecord[]
let setup: Setup

beforeAll(async () => {
  setup = new Setup('session/test-initiator.json', null)
  await setup.init()
  definitions = setup.clientConfig.definitions
  expected = require(path.join(root, 'examples/FIX.4.4/fix.json'))
  views = await setup.client.replayer.replayFixFile(path.join(root, 'examples/FIX.4.4/jsfix.test_client.txt'))
  store = new FixMsgMemoryStore('test', setup.clientConfig)
  records = views.reduce((agg: IFixMsgStoreRecord[], v: AsciiView) => {
    if (v.getString(MsgTag.SenderCompID) === 'accept-comp') {
      agg.push(FixMsgStoreRecord.toMsgStoreRecord(v))
    }
    return agg
  }, new Array<IFixMsgStoreRecord>())
  const toWrite = records.map(async r => await store.put(r))
  await Promise.all(toWrite)
}, 45000)

test('expect 15 messages in log', () => {
  expect(views.length).toEqual(15)
})

/*
8=FIX4.4|9=000112|35=AQ|49=accept-tls-comp|56=init-tls-comp|34=2|57=fix|52=20210307-16:16:44.429|568=all-trades|569=0|749=0|750=0|10=142|
8=FIX4.4|9=000209|35=AE|49=accept-tls-comp|56=init-tls-comp|34=3|57=fix|52=20210307-16:16:44.430|571=100000|487=0|856=0|828=0|17=600000|39=2|570=N|55=Platinum|48=Platinum.INC|32=172|31=7.36|75=20210307|60=20210307-16:16:44.430|10=043|
8=FIX4.4|9=000202|35=AE|49=accept-tls-comp|56=init-tls-comp|34=4|57=fix|52=20210307-16:16:44.431|571=100001|487=0|856=0|828=0|17=600001|39=2|570=N|55=Gold|48=Gold.INC|32=175|31=83.67|75=20210307|60=20210307-16:16:44.430|10=219|
8=FIX4.4|9=000210|35=AE|49=accept-tls-comp|56=init-tls-comp|34=5|57=fix|52=20210307-16:16:44.432|571=100002|487=0|856=0|828=0|17=600002|39=2|570=N|55=Platinum|48=Platinum.INC|32=146|31=41.79|75=20210307|60=20210307-16:16:44.430|10=097|
8=FIX4.4|9=000211|35=AE|49=accept-tls-comp|56=init-tls-comp|34=6|57=fix|52=20210307-16:16:44.432|571=100003|487=0|856=0|828=0|17=600003|39=2|570=N|55=Magnesium|48=Magnesium.INC|32=156|31=8.02|75=20210307|60=20210307-16:16:44.430|10=227|
8=FIX4.4|9=000202|35=AE|49=accept-tls-comp|56=init-tls-comp|34=7|57=fix|52=20210307-16:16:44.432|571=100004|487=0|856=0|828=0|17=600004|39=2|570=N|55=Gold|48=Gold.INC|32=136|31=32.13|75=20210307|60=20210307-16:16:44.430|10=211|
8=FIX4.4|9=000112|35=AQ|49=accept-tls-comp|56=init-tls-comp|34=8|57=fix|52=20210307-16:16:44.433|568=all-trades|569=0|749=0|750=1|10=144|
8=FIX4.4|9=000202|35=AE|49=accept-tls-comp|56=init-tls-comp|34=9|57=fix|52=20210307-16:16:59.449|571=100005|487=0|856=0|828=0|17=600005|39=2|570=N|55=Gold|48=Gold.INC|32=166|31=53.91|75=20210307|60=20210307-16:16:59.449|10=001|
8=FIX4.4|9=000206|35=AE|49=accept-tls-comp|56=init-tls-comp|34=10|57=fix|52=20210307-16:17:14.477|571=100006|487=0|856=0|828=0|17=600006|39=2|570=N|55=Silver|48=Silver.INC|32=105|31=61.2|75=20210307|60=20210307-16:17:14.477|10=191|
 */

test('check messages loaded into store', async () => {
  const state = await store.getState()
  expect(state.lastSeq).toEqual(10)
  expect(state.length).toEqual(9)
})

test('fetch sequence number from store', async () => {
  const res1 = await store.exists(1)
  expect(res1).toBeFalsy()
  for (let seq = 2; seq <= 10; ++seq) {
    const res = await store.exists(seq)
    expect(res).toBeTruthy()
    const get = await store.get(seq)
    expect(get).toBeTruthy()
  }
})

test('fetch from seqNum to inferred as end ', async () => {
  const range1 = await store.getSeqNumRange(5) // to the end
  expect(range1.length).toEqual(6)
  expect(range1[0].seqNum).toEqual(5)
  expect(range1[range1.length - 1].seqNum).toEqual(10)
})

test('fetch from seqNum to = start', async () => {
  const range1 = await store.getSeqNumRange(5, 5)
  expect(range1.length).toEqual(1)
  expect(range1[0].seqNum).toEqual(5)
})

test('fetch start from seqNum not in store', async () => {
  const range1 = await store.getSeqNumRange(1)
  expect(range1.length).toEqual(9)
  expect(range1[0].seqNum).toEqual(2)
  expect(range1[range1.length - 1].seqNum).toEqual(10)
})
