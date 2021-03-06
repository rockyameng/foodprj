/**
 * Created by dev01 on 16/10/13.
 */
const fs            = require('fs');
const sqlite        = require('sql.js');

const filebuffer    = fs.readFileSync('./db/usda-nnd.sqlite3');

const db            = new sqlite.Database(filebuffer);

const Buffer        = require('buffer').Buffer;

const configfile    =  require('../Client');

const COLUMNS_MENU = [
    'id',
    'name'
];

const MSG_TYPE_FOOD_FINISHED = 1;
const MSG_TYPE_ORDER_FINISHED = 2;

const MSG_STATE_NOT_DEALED = 0;
const MSG_STATE_DEALED = 1;

const INTERVAL = 2;   //菜单的时间间隔

const MAXCOUNT = 5;
/**
 * 根据开始和结束时间，获取在指定时间范围吃饭的订单的数量。
 * @param startTime
 * @param endTime
 * @param kitchenid
 * @param menukind
 * @returns {number}
 */
function get_count_from_db(startTime, endTime, kitchenid, menukind) {
    var result = 0;
    var sqlstr = 'select count(*) from orders where eattime > ' + startTime + ' and eattime < ' + endTime +
        ' and kitchenid = ' + kitchenid + ' and menukind = ' + menukind;

    const r = db.exec(sqlstr);

    if (r[0]) {
        result = r[0].values[0][0];

    }

    return  result;
}

/**
 * 获取菜单详细内容。
 * @returns {*}
 */
function get_menu_list(kitchenid, menukind) {
    const r = db.exec(`
        select ${COLUMNS_MENU.join(', ')} from menu
        where active = 1 and kitchenid = ${kitchenid} and menukind = ${menukind} order by priority;
        `);

    var result = [];
    if (r[0]) {

        result = r[0].values.map((entry) => {
            const e = {};
            COLUMNS_MENU.forEach((c, idx) => {
                e[c] = entry[idx];
            });
            return e;
        });

    }
    return  result;
}

/**
 * 获取订单数量
 * @returns {number}
 */
function get_orders_num() {

    var result  =   0;

    const r = db.exec('select count(*) from orders');

    if( r[0] ) {
        result = r[0].values[0][0];
    }

    return result;
}

/**
 * orders表结构说明
 * id  唯一标识符
 * ordertime  下单时间
 * eattime    吃饭时间
 * comment    用户备注
 * status     订单状况（0：还没有开始做   1：完成）
 * orderno    订单发生当天的序号，就是该订单是当天的第几单。
 * @param ordertime   订餐的时间
 * @param dinnertime  用餐的时间
 * @param memo     订单的备注
 * @param orderno  当日订单的编号
 * @param kitchenid 厨房的ID
 * @param menukind  菜单的分类
 */
function  insert_order_list(ordertime, dinnertime, memo, orderno, kitchenid, menukind) {
    var sqlStr  =   'INSERT INTO orders(ordertime, eattime, comment, status, orderno, kitchenid, menukind) VALUES(' +
        ordertime + ', ' +
        dinnertime + ', ' +
        '"' + memo + '"' + ', 0 ,' +
        orderno + ', ' + kitchenid + ', ' + menukind +
        ');';

    db.run(sqlStr);

    sqlStr = 'select id from orders where ordertime = ' + ordertime;
    const r  = db.exec(sqlStr);

    var   result =  -1;
    if(r[0]) {
        result  = r[0].values[0][0];
    }

    return result;
}

/**
 * orderDetail表结构说明
 * orderid  订单id
 * itemid   菜品id
 * id       自增长id
 * status   订单中菜品的状态
 * count    菜品的数量
 * 把菜单的详细信息写入到数据库中
 * @param itemid
 * @param orderid
 * @param count
 * @param name
 */
function insert_order_detail(itemid, orderid, count, name) {
    var sqlStr  = 'INSERT INTO orderdetail(itemid, orderid, count, status, singlename) VALUES(' +
            itemid + ', ' + orderid + ', ' + count + ', 0 , "' + name + '" );';

    db.run(sqlStr);

}

/**
 * 根据炒完的菜的菜品id和订单id，更新订单中菜品的完成状态。
 * @param item
 */
function update_order_status(item) {

    //订单状态更新为完成
    var sqlStr = 'UPDATE orderdetail set status = 1 where orderid = ' + item.orderid + ' and itemid = ' + item.foodid +';';

    db.run(sqlStr);

    var date = new Date();

    /**
     * msgtype: 1: 菜炒完类型消息  2： 订单完成类型消息
     * @type {string}
     */
    sqlStr = `INSERT INTO msgs (orderid, foodid, msgstatus, msgtime, msgtype) VALUES(
         ${item.orderid},${item.foodid}, ${MSG_STATE_NOT_DEALED} , ${date.getTime()}, ${MSG_TYPE_FOOD_FINISHED})`;

    db.run(sqlStr);

}


function get_menu_name(orderid)
{

    var sqlStr = 'SELECT menu.name from kitchenmenukinds as menu, orders where menu.id = orders.menukind and orders.id = '
        + orderid + ';';

    var r = db.exec(sqlStr);

    var menuname = '';
    if(r[0]) {

        menuname = r[0].values[0][0];
    }

    return menuname;
}

/**
 * 更新订单列表中订单的状态（目前处理的有点啰嗦，以后可以考虑优化一下。
 * @param orderid
 * @returns {{orderid: number, orderno: number, eattime: number, details: Array}}
 */
function update_order_list_status(orderid) {

    var sqlStr =  'UPDATE orders set status = 1  where id = ' + orderid + ' ;';

    db.run(sqlStr);

    var date = new Date();

    sqlStr = `INSERT INTO msgs (orderid, foodid, msgstatus, msgtime, msgtype) VALUES(
         ${orderid}, 0, ${MSG_STATE_NOT_DEALED} , ${date.getTime()}, ${MSG_TYPE_ORDER_FINISHED})`;



    db.run(sqlStr);

    var result = {
        orderid: 0,
        foodid : 0,
        orderno: 0,
        eattime: 0,
        details: []
    };

    sqlStr = 'SELECT orders.id, orderno,  eattime, comment, menu.name from orders, kitchenmenukinds as menu ' +
        'where orders.id = '
        + orderid + ' and menu.id = orders.menukind; ';


    var r = db.exec(sqlStr);

    if(r[0]) {
        var values  = r[0].values[0];

        result.orderid = values[0];
        result.orderno = values[1];
        result.eattime = values[2];
        result.comment = values[3];
        result.menuname = values[4];
    }

    sqlStr = 'select  itemid, singlename, count ' +
        'from orderdetail  where orderid  = ' + orderid + ';';

    r = db.exec(sqlStr);

    var details = [];

    if(r[0]) {

        r[0].values.map((item) => {
            details = [...details.slice(0, details.length),
                {foodid:item[0], foodname: item[1], foodcount:item[2]}]
        });

        result.details = details;
    }
    
    return result;
}

/**
 * 获取未完成的订单的菜的个数，如果为0，说明该订单已经完成。
 * @param orderid
 * @returns {number}
 */
function get_unfinished_food_count(orderid) {
    var sqlStr = 'select  count(*) from orderdetail where orderid = ' + orderid + ' and status = 0;';

    var  r = db.exec(sqlStr);

    var  result = 0;
    if(r[0]) {
        result = r[0].values[0][0];
    }

    return result;
}

/**
 *  把数据库数据保存到物理存储。
 */
function save_db() {

    var data = db.export();
    var buffer = new Buffer(data);
    fs.writeFileSync('./db/usda-nnd.sqlite3', buffer);

}

/**
 * 智能获取列表的功能，两个小时内进行累加，两个小时之后的，自然排序。
 * 当累加到单份最大值，就往后累加。
 * @param beginTime
 * @param endTime
 * @returns {Array}
 */
function get_list_by_time_clever ( beginTime, endTime) {
    var querystr  =
        'select ' +
        'orders.id, detail.itemid, detail.count, detail.singlename, orders.eattime, orders.orderno, orders.comment ' +
        'from ' +
        'orderdetail as detail, orders  where detail.orderid = orders.id and detail.status = 0 and ' +
        'detail.orderid in ( ' +
        'select id from orders where orders.eattime > '+ beginTime +' and eattime < ' + endTime
        +') order by orders.eattime;';

    var r = db.exec(querystr);

    var keys = {};
    var cooklist = [];
    var date = new Date();
    date.setHours(0, 0, 0);
    var startTime = date.getTime();
    var interval  = INTERVAL * 3600 * 1000;

    if(r[0]) {
        if(r[0].values[0]) {
            startTime = r[0].values[0][4];
        }
        r[0].values.map((entry) => {
            var itemid = entry[1];
            var time = entry[4];

            var diff = time - startTime;

            //如果没有这个菜，或者做的菜在两个小时之后，在做饭列表立增加
            if(typeof (keys[itemid]) == "undefined" || diff > interval) {
                var length = cooklist.length;
                //当新单在两个小时之内，才需要保存坐标，否则不需要，只是在后面添加就行。
                if(diff < interval) {
                    keys[itemid] = length;
                }
                cooklist[length] = {foodid:entry[1], foodname:entry[3], foodcount:parseInt(entry[2])};
                cooklist[length].orderdetail = [
                    {orderid:entry[0], orderno:entry[5], eattime:entry[4], foodid:entry[1], comment:entry[6],
                    count: parseInt(entry[2])}];
            }
            //如果有这个菜，在列表里增加一个
            else {
                var length = keys[itemid];
                var newcount = cooklist[length].foodcount + parseInt(entry[2]);

                //饭菜的数目超出了最大数目, 那么还是把饭菜放在列表的最后。
                if (newcount > MAXCOUNT) {
                    length = cooklist.length;
                    cooklist[length] = {foodid:entry[1], foodname:entry[3], foodcount:parseInt(entry[2])};
                    cooklist[length].orderdetail = [
                        {orderid:entry[0], orderno:entry[5], eattime:entry[4], foodid:entry[1], comment:entry[6],
                        count : parseInt(entry[2])}];
                }
                else {
                    cooklist[length].foodcount = newcount;
                    cooklist[length].orderdetail = [
                        ...cooklist[length].orderdetail.slice(0, cooklist[length].orderdetail.length),
                        {orderid:entry[0], orderno:entry[5], eattime:entry[4], foodid:entry[1], comment:entry[6],
                        count : parseInt(entry[2])}, ];
                }
            }
        });
    }
    return cooklist;
}

/**
 * 根据时间获取列表。
 * @param beginTime
 * @param endTime
 * @returns {Array}
 */
function get_list_by_time ( beginTime, endTime) {
    var querystr  =
        'select ' +
        'orders.id, detail.itemid, detail.count, detail.singlename, orders.eattime, orders.orderno ' +
        'from ' +
        'orderdetail as detail, orders  where detail.orderid = orders.id and detail.status = 0 and ' +
        'detail.orderid in ( ' +
        'select id from orders where orders.eattime > '+ beginTime +' and eattime < ' + endTime
        +') order by orders.eattime;';

    var r = db.exec(querystr);

    var keys = {};
    var cooklist = [];
    if(r[0]) {
        r[0].values.map((entry) => {
            var itemid = entry[1];

            //如果没有这个菜，在做饭列表立增加
            if(typeof (keys[itemid]) == "undefined") {
                var length = cooklist.length;
                keys[itemid] = length;
                cooklist[length] = {foodid:entry[1], foodname:entry[3], foodcount:parseInt(entry[2])};
                cooklist[length].orderdetail = [
                    {orderid:entry[0], orderno:entry[5], eattime:entry[4], foodid:entry[1], comment:entry[6],
                    count:parseInt(entry[2])}];
            }
            //如果有这个菜，在列表里增加一个
            else {
                var length = keys[itemid];
                cooklist[length].foodcount = cooklist[length].foodcount + parseInt(entry[2]);
                cooklist[length].orderdetail = [
                    ...cooklist[length].orderdetail.slice(0, cooklist[length].orderdetail.length),
                    {orderid:entry[0], orderno:entry[5], eattime:entry[4], foodid:entry[1], comment:entry[6],
                    count: parseInt(entry[2])}];
            }
        });
    }
    return cooklist;
}

/**
 * 获取要炒的菜的列表
 */
function get_cook_list() {

    var today     = new Date();

    today.setHours(0,0,0);

    var beginTime = today.getTime();

    today.setDate(today.getDate() + 1);

    var endTime   = today.getTime();


    var cooklist = get_list_by_time_clever(beginTime, endTime);

    return cooklist;

}


/**
 * 获取明日要炒的菜的列表
 */
function get_tomorrow_cook_list() {
    var date = new Date();

    date.setHours(0, 0 , 0);

    date.setDate(date.getDate() + 1);

    var beginTime = date.getTime();

    date.setDate(date.getDate() + 1);

    var endTime = date.getTime();

    var cooklist = get_list_by_time(beginTime, endTime);

    return cooklist;
}

/**
 * 更新消息表中消息处理的状态
 * @param data
 */
function update_msg_status(data) {

    var sqlStr = `update msgs set msgstatus = 1 where orderid = ${data.orderid} 
        and foodid = ${data.foodid};`;

    db.run(sqlStr);
}


/**
 *  获取未处理的消息
 * @param kitchenid
 */
function get_messages(kitchenid) {
    var date = new Date();

    date.setHours(0, 0 , 0);

    var startTime = date.getTime();

    date.setDate(date.getDate() + 1);

    var endTime = date.getTime();
    var sqlStr = `select msgs.orderid,  menu.name,  menukind.name, orders.orderno, msgs.foodid 
                 from msgs, orders, kitchenmenukinds as menukind, menu 
                 where orders.id = msgs.orderid and menukind.id = orders.menukind and menu.id = msgs.foodid 
                       and msgs.msgstatus = 0 and orders.kitchenid = ${kitchenid} and 
                       (msgs.msgtime > ${startTime}  and msgs.msgtime < ${endTime} );
                        `;

    var r = db.exec(sqlStr);

    var result = [];
    if(r[0]) {

        r[0].values.map((message) => {
            result = [
                {orderid : message[0],
                 foodid  : message[4],
                 foodname : message[1],
                 menukind: message[2],
                 orderno : message[3]},
                ...result.slice(0, result.length)
            ]
        })

    }

    return result;
}

/**
 * 根据厨房id,获取团队的列表
 * @param kitchenid
 */
function getCompanyList(kitchenid) {
    
}

/**
 * 根据厨房id,公司id获取改公司的明天的菜单
 * 目前获取菜单的规则是, 今天只能下明天的单子,过12点之后就算明天了
 * @param kitchenid
 * @param companyid
 */
function get_company_submenu_list(kitchenid, companyid) {

    var startTime = new Date();


    var endTime   = new Date();

    startTime.setHours(23, 59, 59, 999);

    endTime.setDate(endTime.getDate() + 1);

    endTime.setHours(23, 59, 59, 999);

    var sqlStr = `select csmenu.id,  menu.name from companymenu as cmenu, companysubmenu as csmenu, menu 
                    where csmenu.id = cmenu.companysubmenuid and cmenu.menuid = menu.id and 
                    (csmenu.effecttime > ${startTime.getTime()} and csmenu.effecttime < ${endTime.getTime()});`;

    console.log(sqlStr);

    var r = db.exec(sqlStr);


    var keys = [];
    var result = [];
    var length = 0;
    if(r[0]) {
        console.log(r[0].values);
        r[0].values.map((item)=> {
            var submenuid = item[0];
            if(typeof (keys[submenuid]) == "undefined") {
                result[length] = {'id': submenuid, 'values': item[1]};
                keys[submenuid] = length;
                length = length + 1;
            }
            else {
                var index = keys[submenuid];
                result[index].values = result[index].values + ',' +  item[1];
            }
        });
    }

    return result;
}

function insert_company_order(companyid, phoneno, submenuid, ip) {
    var today = new Date();

    var time = today.getTime();

    var sqlStr = `INSERT into companyorderdetail(companysubmenuid, ordertime, phoneno, ip) 
        VALUES(${submenuid}, ${time}, ${phoneno}, "${ip}")`;

    console.log(sqlStr);
    db.run(sqlStr);
}

function get_company_order_list(kitchenid, companyid) {
    var tomorrow = new Date();

    tomorrow.setHours(23, 59, 59);
    var starttime = tomorrow.getTime();

    tomorrow.setDate(tomorrow.getDate() + 1);

    var endtime = tomorrow.getTime();

    var sqlStr = `select phoneno, companysubmenuid, ordertime, ip from companyorderdetail as codetail, 
                companysubmenu as csmenu where codetail.companysubmenuid= csmenu.id and 
                csmenu.effecttime > ${starttime} and csmenu.effecttime < ${endtime} ;  `;


    console.log(sqlStr);

    var result = [];
    var menulist = get_company_submenu_list(kitchenid, companyid);
    var r = db.exec(sqlStr);

    var length = 0;
    if(r[0]) {
        menulist.map((menu) => {

            result[length] = {'id':menu.id, 'name': menu.values, details:[]};

            var detailLength = 0;

            var details = [];

            r[0].values.map((item) => {
                if(item[1] == menu.id) {
                    details[detailLength] = item;
                    detailLength ++;
                }

            })
            result[length].details = details;

            length ++;
        });
    }

    return result;

}

exports.get_menu_list       =   get_menu_list;

exports.get_count_from_db   =   get_count_from_db;

exports.get_orders_num      =   get_orders_num;

exports.insert_order_list   =   insert_order_list;

exports.insert_order_detail =   insert_order_detail;

exports.save_db             =   save_db;

exports.get_cook_list       =   get_cook_list;

exports.update_order_status =   update_order_status;

exports.get_unfinished_food_count = get_unfinished_food_count;

exports.update_order_list_status  = update_order_list_status;

exports.get_tomorrow_cook_list = get_tomorrow_cook_list;

exports.get_list_by_time_clever = get_list_by_time_clever;

exports.get_menu_name           = get_menu_name;

exports.update_msg_status       = update_msg_status;

exports.get_messages            = get_messages;

exports.get_company_submenu_list = get_company_submenu_list;

exports.inset_company_order     =   insert_company_order;

exports.get_company_order_list  =   get_company_order_list;
