/**
 * Created by 은화 on 2015-05-17.
 */


exports.get_keywordlist_by_community = function (next) {
    return function (db, community) {
        var where = {};
        if (community !== undefined) {
            where.community = community;
        }
        db.collection('keyword').find(where).sort({ score: -1 }).toArray(
            function (err, keyword_list) {
                if (err) {
                    throw err;
                }
                next(keyword_list);
            }
        );
    }
}

exports.get_keyword_info = function (next) {
    return function (db, keyword) {
        if(keyword === undefined) {
            return next(undefined);
        }

        db.collection('keyword').findOne({ _id: keyword }, {}, function (err, data) {
            if (err) {
                throw err;
            }
            next(data);
        });
    }
}

exports.get_article_ids_by_keyword = function (next) {
    return function (db, keyword, hour) {
        if(keyword === undefined) {
            return next(undefined);
        }

        var where = {
            "keywords.keyword": keyword
        };

        if (hour !== undefined) {
            var date = new Date();
            date.setHours(date.getHours() - hour);
            where.date = {
                "$gt": date
            };
        }

        db.collection('article').find(where, { _id: true }).toArray(function (err, article_list) {
            if (err) {
                throw err;
            }

            next(article_list);
        });
    }
}

exports.get_keywords = function (next) {
    return function (db, hour) {
        db.collection('batch_log').findOne({ _id: hour }, {}, function (err, doc) {
            if (err) {
                throw err;
            }

            if (doc === undefined || doc === null) {
                return next(undefined);
            }

            if (doc.batch_time === undefined) {
                return next(undefined);
            }

            db.collection('keyword_' + hour).find().sort({rank: 1}).limit(50).toArray(function (err, keyword_list) {
                if (err) {
                    throw err;
                }
                next(doc.batch_time, keyword_list);
            });
        });
    }
}