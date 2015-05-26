conn = new Mongo();
db = conn.getDB("trendetector");

db.community.drop();
var rows = 
[
	{
		_id: 'CL',
		name: '클리앙'
	},
	{
		_id: 'SR',
		name: 'SLR클럽'
	},
	{
		_id: 'OU',
		name: '오늘의유머'
	},
	{
		_id: 'DD',
		name: '개드립'
	},
	{
		_id: 'MP',
		name: 'MLBPARK'
	},
	{
		_id: 'BD',
		name: '보배드림'
	},
	{
		_id: 'PP',
		name: '뽐뿌'
	},
	{
		_id: 'RW',
		name: '루리웹'
	},
	{
		_id: 'CK',
		name: '82cook'
	}
];
db.community.insert(rows);

db.board.drop();
var rows =
[
	{
		community: 'CL',
		name: '모두의공원',
		url: 'http://www.clien.net/cs2/bbs/board.php?bo_table=park',
		imagedown: false,
		active: true
	},
	{
		community: 'CL',
		name: '새로운소식',
		url: 'http://www.clien.net/cs2/bbs/board.php?bo_table=news',
		imagedown: false,
		active: true
	},
	{
		community: 'SR',
		name: '자유게시판',
		url: 'http://www.slrclub.com/bbs/zboard.php?id=free',
		imagedown: false,
		active: true
	},
	{
		community: 'OU',
		name: '베스트게시물',
		url: 'http://www.todayhumor.co.kr/board/list.php?table=humorbest',
		active: true
	},
	{
		community: 'DD',
		name: '개드립',
		url: 'http://www.dogdrip.net/dogdrip',
		active: true
	},
	{
		community: 'MP',
		name: 'BULLPEN',
		url: 'http://mlbpark.donga.com/mbs/articleL.php?mbsC=bullpen2',
		imagedown: false,
		active: true
	},
	{
		community: 'BD',
		name: '자유게시판',
		url: 'http://www.bobaedream.co.kr/list?code=freeb',
		active: true
	},
	{
		community: 'PP',
		name: '자유게시판',
		url: 'http://www.ppomppu.co.kr/zboard/zboard.php?id=freeboard',
		imagedown: false,
		active: true
	},
	{
		community: 'RW',
		name: '유머게시판',
		url: 'http://bbs2.ruliweb.daum.net/gaia/do/ruliweb/default/community/325/list?bbsId=G005&pageIndex=1&itemId=143',
		active: true
	},
	{
		community: 'CK',
		name: '자유게시판',
		url: 'http://www.82cook.com/entiz/enti.php?bn=15',
		active: true
	}
]
db.board.insert(rows);


// =========== 주의!!!!!! 데이터 날릴 수 있음!!! ===============
// =========== 주의!!!!!! 데이터 날릴 수 있음!!! ===============
// =========== 주의!!!!!! 데이터 날릴 수 있음!!! ===============
db.article.drop();
db.article.ensureIndex(
	{ board_id: 1, article_no: 1 },
	{ unique: true }
);

db.statistics.drop();
db.statistics.insert({ _id: 0, totalcnt: 0 });

db.statistics.keywords.drop();
// =========== 주의!!!!!! 데이터 날릴 수 있음!!! ===============
// =========== 주의!!!!!! 데이터 날릴 수 있음!!! ===============
// =========== 주의!!!!!! 데이터 날릴 수 있음!!! ===============



db.system.js.remove({});
// ======== 1주일 전 데이터들 삭제 및 통계 누적 =========
db.system.js.save({
	_id: "removeAndStatisticsBeforeWeek",
	value: function () {
		if (db.statistics_temp.count() != 0) {
			return { ok: false, error: "already exists statistics_temp." };
		}

		var map = function () {
			this.keywords.forEach(function (data) {
				var key = data.keyword;
				if (key.length < 2 || key.length > 15) {
					return;
				}

				emit(key, 1);
			});
		};

		var reduce = function (key, values) {
			var count = 0;
			values.forEach(function (cnt) {
				count += cnt;
			});
			return count;
		};

		var now = new ISODate();
		now.setDate(now.getDate() - 7);

		var result = 
		db.article.mapReduce(map, reduce, {
			out: "statistics_temp",
			query: { 
				keywords: { $exists: true, $not: { $eq: false } },
				date: { $lt : now }
			}
		});

		if (result.ok != 1) {
			db.statistics_temp.drop();
			return { ok: false, result: result };
		}
		var inc_cnt = result.counts.input;
		if (inc_cnt == 0) {
			return { ok: true, result: "no data" };
		}

		db.article.remove({ date: { $lt: now } });

		var result = db.statistics.update(
				{ _id: 0 }, 
				{ $inc: { totalcnt: inc_cnt } },
				{ upsert: true }
			);

		if (result.nMatched == 0 
		&& result.nUpserted == 0 
		&& result.nModified == 0) {
			return { ok: false, result: result };
		}

		var bulkUpdate = db.statistics.keywords.initializeUnorderedBulkOp();
		db.statistics_temp.find().forEach(function (doc) {
			bulkUpdate.find({_id: doc._id}).upsert().update(
				{ $inc: { cnt: doc.value } }
			);
		});
		var result = bulkUpdate.execute();

		if (result.nMatched == 0 
		&& result.nUpserted == 0 
		&& result.nModified == 0) {
			return { ok: false, result: result };
		}

		db.statistics_temp.drop();
	}
});
// =========================================


// ========= 시간대 별 키워드 추출 및 순위 결정 =========
db.system.js.save({
	_id: "keywordRecommendation",
	value: function (hour) {
		var before = Number(hour);

		if (isNaN(before)) {
			return { "ok": false, "error": "hour is NaN" };
		}

		var strCollection = "keyword_" + before;

		/* MapReduce -> create Keyword, NTF Colection */
		var map = function () {
			this.keywords.forEach(function (data) {
				var key = data.keyword;
				if (key.length < 2 || key.length > 15) {
					return;
				}

				emit(key, { "ntf": data.tf, "cnt": 1 });
			});
		};

		var reduce = function (key, values) {
			var reduceVal = { "ntf": 0, "cnt": 0 };

			values.forEach(function (doc) {
				reduceVal.ntf += doc.ntf;
				reduceVal.cnt += doc.cnt;
			});
			
			/* NTF 정규화 목적 */
			if (NTFMAX < reduceVal.ntf) {
				NTFMAX = reduceVal.ntf;
			}

			return reduceVal;
		};

		/* NTF 정규화 목적 */
		var finalizeF = function (key, reduceVal) {
			reduceVal.ntf = reduceVal.ntf / NTFMAX;
			return reduceVal;
		}

		var now = new ISODate();
		var date = new ISODate();
		date.setHours(now.getHours() - before);

		db.article.mapReduce(map, reduce, {
			"out": { "replace": strCollection },
			"query": {
				"keywords": { "$exists": true, "$not": { "$eq": false } },
				"date": { "$gt": date }
				
			},
			"scope": { "NTFMAX": 0 }
			/*
			,finalize: finalizeF,	// NTF 정규화 할 때 주석 제거
			*/
		});

		/* 통계 데이터를 이용한 NTFIDF 계산 */
		var totalcnt = db.statistics.findOne().totalcnt;
		var bulkUpdate = db[strCollection].initializeUnorderedBulkOp();
		db[strCollection].find().forEach(function (doc) {
			var stat = db.statistics.keywords.findOne({ "_id": doc._id });
			var kcnt = 0;

			if (stat !== null) {
				kcnt = stat.cnt;
			}

			var idf = Math.log((totalcnt + 1) / (kcnt + 1));
			var ntfidf = Math.log(doc.value.ntf + 1.0) * idf;

			bulkUpdate.find({ "_id": doc._id }).updateOne({
				"$set": { "value.idf": idf, "value.ntfidf": ntfidf }
			});
		});
		var result = bulkUpdate.execute();
		if (result.nMatched == 0 
		&& result.nUpserted == 0 
		&& result.nModified == 0) {
			return { "ok": false, "result": result };
		}

		// ==== 키워드 순위 결정 ==== //

		/* 일상어 제거
		 * 전체기간에서 x퍼센트 이상 등장한 단어 제거
		 * log(100 / x)
		 */
		var minidf = Math.log(100 / 3);
		var where = {
			"value.idf": { "$gt": minidf }
		}

		/* NTF순 Rank */
		var bulkRank = db[strCollection].initializeUnorderedBulkOp();
		var cnt = 1;
		db[strCollection].find(where).sort({ "value.ntf": -1 }).forEach(function (doc) {
			bulkRank.find({ "_id": doc._id }).updateOne({
				"$set": { "rank": cnt }
			});
			cnt++;
		});
		var result = bulkRank.execute();
		if (result.nMatched == 0 
		&& result.nUpserted == 0 
		&& result.nModified == 0) {
			return { "ok": false, "result": result };
		}

		/* NTFIDF순 Rank */
		var bulkRank = db[strCollection].initializeUnorderedBulkOp();
		var cnt = 1;
		db[strCollection].find(where).sort({ "value.ntfidf": -1 }).forEach(function (doc) {
			bulkRank.find({ "_id": doc._id }).updateOne({
				"$inc": { "rank": cnt }
			});
			cnt++;
		});
		var result = bulkRank.execute();
		if (result.nMatched == 0 
		&& result.nUpserted == 0 
		&& result.nModified == 0) {
			return { "ok": false, "result": result };
		}

		// ==== 키워드 순위 결정 END ==== //

		var result = db.batch_log.save({
			"_id": hour,
			"batch_time": now
		});
		if (result.nMatched == 0 
		&& result.nUpserted == 0 
		&& result.nModified == 0) {
			return { "ok": false, "result": result };
		}
		
		return { "ok": true };
	}
});
// =========================================