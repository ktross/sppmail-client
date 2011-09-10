air.trace(" ");
air.trace("SPPMail Debugger");
air.trace(" ");

try { air.NativeApplication.nativeApplication.startAtLogin = true; } catch (e) { logMsg( "Cannot set startAtLogin: " + e.message ); }

var baseURL = 'http://api.sppmail.com/';
var loginPath = 'login/';
var replyPath = 'reply/';
var deletePath = 'delete/';
var sql_delete = 'DELETE FROM settings';
var refreshInterval = 20000;
window.htmlLoader.navigateInSystemBrowser = true;

var inboxWindow = window.nativeWindow;

var iconLoadComplete = function(event) { air.NativeApplication.nativeApplication.icon.bitmaps = [event.target.content.bitmapData]; } 
air.NativeApplication.nativeApplication.autoExit = false;
var iconLoad = new air.Loader();
var iconMenu = new air.NativeMenu();

var showCommand = iconMenu.addItem(new air.NativeMenuItem("Restore"));
showCommand.addEventListener(air.Event.SELECT,function(event){
        inboxWindow.visible = true;
});

var exitCommand = iconMenu.addItem(new air.NativeMenuItem("Exit"));
exitCommand.addEventListener(air.Event.SELECT,function(event){
    mpmetrics.track('Exit');
    air.NativeApplication.nativeApplication.icon.bitmaps = [];
    inboxWindow.visible = true;
    air.NativeApplication.nativeApplication.exit();
});

if (air.NativeApplication.supportsSystemTrayIcon) {
    air.NativeApplication.nativeApplication.autoExit = false;
    iconLoad.contentLoaderInfo.addEventListener(air.Event.COMPLETE,iconLoadComplete);
    iconLoad.load(new air.URLRequest("icons/SPPMail_16.png"));
    air.NativeApplication.nativeApplication.icon.tooltip = "AIR application";
    air.NativeApplication.nativeApplication.icon.menu = iconMenu;
    air.NativeApplication.nativeApplication.icon.addEventListener("mouseDown", onIconClick);
}
if (air.NativeApplication.supportsDockIcon) {
    iconLoad.contentLoaderInfo.addEventListener(air.Event.COMPLETE,iconLoadComplete);
    iconLoad.load(new air.URLRequest("icons/SPPMail_100.png"));
    air.NativeApplication.nativeApplication.icon.menu = iconMenu;
    air.NativeApplication.nativeApplication.icon.addEventListener("mouseDown", onIconClick);
}

inboxWindow.addEventListener(air.Event.CLOSING, preventClose);

try {
    var mpmetrics = new MixpanelLib("");
} catch(err) {
    var null_fn = function () {};
    var mpmetrics = { 
        track: null_fn, 
        track_funnel: null_fn, 
        register: null_fn, 
        register_once: null_fn,
        register_funnel: null_fn,
        identify: null_fn
    };
}

function onIconClick(event) {
    inboxWindow.visible = true;
}

function preventClose(event) {
    event.preventDefault();
    inboxWindow.visible = false;
}

function startRefresh(type, uid) {
    refresher = setInterval(function(){updateInbox(type,uid)}, refreshInterval);
}

function stopRefresh() {
    clearInterval(refresher);
}

function createNotification() {
    var options = new air.NativeWindowInitOptions(); 
    options.systemChrome = "none"; 
    options.type = "lightweight";
    options.transparent = true;
    //var xpos = air.Screen.mainScreen.bounds.width - 333;
    //var ypos = air.Screen.mainScreen.bounds.height - 100;
    var windowBounds = new air.Rectangle(10,10,333,67); 
    var newHTMLLoader = air.HTMLLoader.createRootWindow(true, options, true, windowBounds);
    newHTMLLoader.window.nativeWindow.alwaysInFront = true;
    newHTMLLoader.load(new air.URLRequest("notification_msg.html"));
    //play notification sound
    var request = new air.URLRequest('app:/audio/notify.mp3');
    var notifyMp3 = new air.Sound();
    notifyMp3.load(request);
    notifyMp3.play();
    newHTMLLoader.window.nativeWindow.addEventListener("click", destroyNotification);
    inboxWindow.notifyUser('critical');
    setTimeout(function(){newHTMLLoader.window.nativeWindow.close();},5000);
}

function destroyNotification() {
    newHTMLLoader.window.nativeWindow.close();
}

function displayLogin() { $('#loginContainer').show(); }
function hideLogin() { $('#loginContainer').hide(); }

var conn = new air.SQLConnection();
var folder = air.File.applicationStorageDirectory;
var dbFile = folder.resolvePath("sppmail.db");
try {
	conn.open(dbFile);
	logMsg("Database initialized successfully");
	//create table if it doesn't exist
	var createStmt = new air.SQLStatement();
	createStmt.sqlConnection = conn;
	var sql =
		"CREATE TABLE IF NOT EXISTS settings (" +
		"    id INTEGER PRIMARY KEY AUTOINCREMENT, " +
		"    uid TEXT" +
		")";
	createStmt.text = sql;
	try {
		createStmt.execute();
		logMsg("Table initialized successfully");
	} catch (error) {
		logMsg("Error message:", error.message);
		logMsg("Details:", error.details);
	}
} catch (error) {
	logMsg("Error message:", error.message);
	logMsg("Details:", error.details);
}

function init() {
	//check for uid
	var selectStmt = new air.SQLStatement();
	selectStmt.sqlConnection = conn;
	selectStmt.text = "SELECT uid FROM settings";
	try {
		selectStmt.execute();
		var result = selectStmt.getResult();
		var numResults = result.data.length;
		if (numResults >= 1) {
		    sppmail_uid = result.data[0].uid;
                    logMsg("UID Set: "+sppmail_uid);
		    getInbox('messages',sppmail_uid);
		} else {
                    logMsg('UID not found. Displaying login page.');
		    displayLogin();
		}
	} catch (error) {
		displayLogin();
	}
        if (typeof(sppmail_uid) == 'undefined') {
            mpmetrics.track('Init', {
                'type': 'New'
            });
        } else {
            mpmetrics.track('Init', {
                'type': 'Returning'
            });
        }
}

function insertMsg(from_name, from_url, from_img, subject, date, content, token_to, token_thread, thread_tokens, message_tokens) {
    var thisMsg = '<div class="message">' +
        '<div class="thumb"><img src="'+from_img+'"></div>' +
        '<div class="info"><span class="from"><a href="'+from_url+'">'+from_name+'</a></span><span class="subject">'+subject+'</span></div>' +
        '<div class="clear"></div>' +
        '<div class="content">'+content+'<div class="clear"></div></div>' +
        '<div class="reply"><a class="cancel hidden">Cancel</a><a href="javascript:void(0);" class="showreply">Reply</a><span class="token_to">'+token_to+'</span><span class="token_thread">'+token_thread+'</span></div>' +
        '<div class="delete"><span class="thread_tokens">'+thread_tokens+'</span><span class="message_tokens">'+message_tokens+'</span><span class="x">X</span></div>' +
    '</div>';
    $('#messages').append(thisMsg);
}

function sppLogin(sppEmail,sppPassword) {
	//login
	$.ajax({
		type: "POST",
		url: baseURL+loginPath,
		data: 'email='+sppEmail+'&password='+sppPassword,
		cache: false,
		async: false,
		dataType: "json",
		success: function(data) {
			if (data.status == 'success') {
				sppmail_uid = data.uid;
				var insertStmt = new air.SQLStatement();
				insertStmt.sqlConnection = conn;
				var sql = "INSERT INTO settings (uid) VALUES ('"+sppmail_uid+"')";
				insertStmt.text = sql;
				try {
					insertStmt.execute();
                                        logMsg('UID successfully written to database');
				} catch (error) {
					alert("Failed to insert UID into database");
				}
				hideLogin();
                                delete loggedOut;
                                mpmetrics.track('Login');
				getInbox('messages',sppmail_uid);
			} else {
				logMsg('Login failed');
                                mpmetrics.track('Error', {
                                    'type': 'Login failed'
                                });
                                //todo: show notification
			}
		}
	});
}

function updateTime(){
    $('#messages .message .content .poster_name span.spp_time').each(function() {
        var month = new Array('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec');
        var sppTime = $(this).attr('ut');
        var newDate = new Date();
        newDate.setTime(sppTime*1000);
        var jsTime = newDate.toUTCString();
        var d = new Date(jsTime);
        var thisHours = d.getHours();
        var ampm = ((thisHours >= 12) ? " PM" : " AM");
        thisHours = ((thisHours == 0) ? "12" : (thisHours > 12) ? thisHours - 12 : thisHours);
        var thisMinutes = (d.getMinutes() < 10) ? "0" + d.getMinutes() : d.getMinutes();
        var localTime = month[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear()+' '+thisHours+':'+thisMinutes+' '+ampm;
        $(this).text(localTime);
    });
}

function getInbox(type,uid) {
    inboxurl = baseURL+'inbox/'+type+'/'+uid;
    var container = $('#container');
    container.addClass('loading');
    $.ajax({
        type: "GET",
        url: inboxurl,
        cache: false,
        async: true,
        dataType: "json",
        success: function(data) {
            if (data.status == 'fail') {
                logMsg('Invalid UID');
                logOut();
                container.removeClass('loading');
                displayLogin();
            } else {
                for (key in data.messages) {
                    insertMsg(data.messages[key].from_name, data.messages[key].from_url, data.messages[key].from_img, data.messages[key].subject, data.messages[key].date, data.messages[key].content, data.messages[key].token_to, data.messages[key].token_thread, data.messages[key].thread_tokens, data.messages[key].message_tokens);
                }
                inbox_md5 = data.md5;
                container.removeClass('loading');
                $('#nav #msg').addClass('active');
                startRefresh(type, uid);
                paginate();
                // Update to local time. UGH!
                updateTime();
                $('#messages').show();
                showLogout();
            }
        },
        error: function(XMLHttpRequest, textStatus, errorThrown) {
            //try to update again
            mpmetrics.track('Error', {
                'type': 'Initial update failed'
            });
            alert('There was an error retrieving your messages. Click "Ok" to try again.');
        }
    });
}

function paginate() {
    $('#page_container').pajinate({
        items_per_page : 5,
        item_container_id : '#messages',
        nav_panel_id : '.page_navigation',
        num_page_links_to_display : 5
    });
}

function logMsg(msg) {
    var time = new Date();
    var hours = time.getHours();
    var minutes = time.getMinutes();
    var seconds = time.getSeconds();
    var ms = time.getMilliseconds();
    air.trace('['+hours+':'+minutes+':'+seconds+':'+ms+'] '+msg);
}

function updateOnce(type, uid) {
    if (typeof(ajaxInProgress) == 'undefined') {
        pauseUpdate = true;
        updateInbox(type, uid, true);
    } else {
        logMsg("Refresh: Update prevented. HTTPRequest already in progress.");
    }
}

function showLogout() {
    $('#logout').show();
}
function hideLogout() {
    $('#logout').hide();
}

function updateInbox(type, uid, silent) {
    inboxurl = baseURL+'inbox/'+type+'/'+uid;
    var refreshInbox = $.ajax({
        type: "GET",
        url: inboxurl,
        cache: false,
        async: true,
        dataType: "json",
        beforeSend: function() {
            logMsg("Refresh: initializing");
            if ($('#messages .message .reply div textarea').length == 0) {
                ajaxInProgress = true;
            } else {
                if ($('#messages .message .reply div textarea').val() == '' && typeof(pauseUpdate) == 'undefined') {
                    ajaxInProgress = true;
                } else {
                    logMsg('Failed to refresh inbox. Reply field is in use');
                    refreshInbox.abort();
                }
            }
        },
        success: function(data) {
            logMsg("Refresh: Returned response");
            if (data.status == 'fail') {
                logMsg("Refresh: Failed to update. UID is invalid");
                logOut();
                displayLogin();
            } else {
                if ($('#messages .message .reply div textarea').val() == '' || $('#messages .message .reply div textarea').length == 0) {
                    if (typeof(data.md5) != 'undefined' && inbox_md5 != data.md5) {
                        inbox_md5 = data.md5;
                        $('#messages').children().fullRemove();
                        $('#page_container .page_navigation').empty();
                        for (key in data.messages) {
                            insertMsg(data.messages[key].from_name, data.messages[key].from_url, data.messages[key].from_img, data.messages[key].subject, data.messages[key].date, data.messages[key].content, data.messages[key].token_to, data.messages[key].token_thread, data.messages[key].thread_tokens, data.messages[key].message_tokens);
                        }
                        if (typeof(silent) == 'undefined') {
                            createNotification();
                        } else {
                            $('#messages .message .delete span.x').show();
                            logMsg("Refresh: Silent mode");
                        }
                        $('div.page_navigation').show();
                        paginate();
                        updateTime();
                    }
                }
            }
        },
        error: function() {
            logMsg("Refresh: AJAX Error");
            delete pauseUpdate;
            mpmetrics.track('Error', {
                'type': 'Refresh failed'
            });
        },
        complete: function() {
            logMsg("Refresh: Completed");
            delete ajaxInProgress;
            if (typeof(loggedOut) == 'undefined') {
                if (typeof(pauseUpdate) != 'undefined') {
                    delete pauseUpdate;
                }
            }
        }
    });
}

function logOut() {
    var deleteStmt = new air.SQLStatement(); 
    deleteStmt.sqlConnection = conn;
    deleteStmt.text = sql_delete;
    try {
        deleteStmt.execute();
        logMsg('cleared settings db');
    } catch (error) {
        logMsg("Error message:", error.message); 
        logMsg("Details:", error.details); 
    }
    $('#messages').children().fullRemove();
    $('div.page_navigation').empty();
    $('div.page_navigation').hide();
    $('#messages').hide();
    $('#login #email').val('');
    $('#login #password').val('');
    delete sppmail_uid;
    loggedOut = true;
    hideLogout();
    stopRefresh();
    mpmetrics.track('Logout');
}

function unixTime() {
    return parseInt(new Date().getTime().toString().substring(0, 10), 10);
}

function logEvent(event) {
    var url = "http://api.mixpanel.com/track/?data=";
    var data = {   "event": event, 
        "properties": {
            "token": ""
        }
    };
    data = Base64.encode(array2json(data));
    url = url+data;
    url = url+"&ip=1";
    $.ajax({
        type: "GET",
        url: url,
        cache: false,
        async: true,
        success: function(data) {
            alert(data);
            alert(url);
        }
    });
}

$(function() {
    hideLogin();
    init();
    $('#login').submit(function() {
            sppLogin($('#login #email').val(),$('#login #password').val());
            return false;
    });
    $('#messages .message .reply a.showreply').live('click', function() {
        $('#messages .message .reply div').fullRemove();
        $('#messages .message a.sendreply').removeClass('sendreply').addClass('showreply').text('Reply');
        $('#messages .message a.cancel').addClass('hidden');
        var token_to = $(this).siblings('.token_to').text();
        var token_thread = $(this).siblings('token_thread').text();
        var form = '<div><textarea></textarea></div>';
        $(this).parent().prepend(form);
        $(this).removeClass('showreply').addClass('sendreply').text('Send');
        $(this).siblings('a.cancel').removeClass('hidden');
        $('#messages .message .reply textarea').focus();
    });
    $('#messages .message .reply a.sendreply').live('click', function() {
        var token_to = $(this).siblings('.token_to').text();
        var token_thread = $(this).siblings('.token_thread').text();
        var content = encodeURIComponent($(this).parent().find('textarea').val());
        $(this).siblings('div').fullRemove();
        $(this).removeClass('sendreply').addClass('showreply').text('Reply');
        $(this).siblings('a.cancel').addClass('hidden');
        $.ajax({
            type: "POST",
            url: baseURL+replyPath,
            data: 'uid='+sppmail_uid+'&token_to='+token_to+'&token_thread='+token_thread+'&content='+content,
            cache: false,
            async: true,
            success: function(data) {
                if (data.status == 'fail') {
                    alert('Your message was not sent.');
                } else {
                    updateOnce('messages', sppmail_uid);
                }
            }
        });
    });
    $('#messages .message .reply a.cancel').live('click', function() {
        $(this).siblings('div').fullRemove();
        $(this).siblings('a.sendreply').removeClass('sendreply').addClass('showreply').text('Reply');
        $(this).addClass('hidden');
    });
    $('#messages .message .delete span.x').live('click', function() {
        if (typeof(confirmDelete) == 'undefined') {
            confirmDelete = true;
            $(this).addClass('confirm');
        } else {
            $('#messages .message .delete span.x').hide();
            var thread_tokens = $(this).siblings('.thread_tokens').text();
            var message_tokens = $(this).siblings('.message_tokens').text();
            $(this).parents('.message').first().fullRemove();
            delete confirmDelete;
            $.ajax({
                type: "POST",
                url: baseURL+deletePath,
                data: 'uid='+sppmail_uid+'&thread_tokens='+thread_tokens+'&message_tokens='+message_tokens,
                cache: false,
                async: true,
                success: function(data) {
                    updateOnce('messages', sppmail_uid);
                }
            });
        }
    });
    $('#messages .message .delete span.x').live('mouseout', function() {
        $(this).removeClass('confirm');
    });
    $('#logout').click(function () {
        logOut();
        displayLogin();
    });
});