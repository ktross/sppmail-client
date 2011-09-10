var AIRUpdater = function () {
    var applicationName = "SPPMail.air";
    var applicationVersion = 0;
    var latestVersion = 0;
    var latestVersionCheckUrl = "http://www.sppmail.com/app/version.xml";
    var updateAvailable = null;
    var updateAvailableDialog = null;
    var releaseNotes = null;
    var releaseNotesText = "";   
    var updaterUrl = "http://www.sppmail.com/app/SPPMail-";
    var stream = null;
    var updateFile = null;

    var getApplicationVersion = function () {
        var appXML = air.NativeApplication.nativeApplication.applicationDescriptor;
        var xmlObject = new DOMParser().parseFromString(appXML, "text/xml");
        applicationVersion = parseFloat(xmlObject.getElementsByTagName('versionNumber')[0].firstChild.nodeValue);
    };

    var getLatestVersion = function () {   
        var XMLHttp = new XMLHttpRequest();
        XMLHttp.onreadystatechange = function () {
            if (XMLHttp.readyState === 4) {
                var response = XMLHttp.responseXML;
                var releaseNotesNode = response.getElementsByTagName("releasenotes")[0];
                if (typeof releaseNotesNode === "object" && releaseNotesNode.firstChild) {
                    releaseNotesText = releaseNotesNode.firstChild.nodeValue;
                }
                var latestVersionNode = response.getElementsByTagName("latestversion")[0];   
                if (typeof latestVersionNode === "object" && latestVersionNode.firstChild) {
                    latestVersion = parseFloat(latestVersionNode.firstChild.nodeValue, 10);
                    compareVersions();
                }
            }
        };
        XMLHttp.open("GET", latestVersionCheckUrl, true);
        XMLHttp.send(null);
    };
    
    var compareVersions = function () {
        if (applicationVersion > 0 && latestVersion > 0 && latestVersion > applicationVersion) {
            document.getElementById("download-update").onclick = initUpdateApplication;
            document.getElementById("cancel-update").onclick = function () {
                document.getElementById("updateContainer").style.display = "none";
            };
            document.getElementById("updateContainer").style.display = "block";
            document.getElementById("version").innerText = "SPPMail v"+latestVersion;
            document.getElementById("notes").innerText = releaseNotesText;
        }
    };
    
    var initUpdateApplication = function () {
        $('#updater #buttons').hide();
        document.getElementById("progress").style.display = "block";
        stream = new air.URLStream();
        stream.addEventListener(air.ProgressEvent.PROGRESS, updatingStatus);
        stream.addEventListener(air.Event.COMPLETE, updateApplication);
        stream.load( new air.URLRequest(updaterUrl + latestVersion + ".air"));
    };
    
    var updatingStatus = function (e) {
        var percentage = Math.round((e.bytesLoaded / e.bytesTotal) * 100);
        var percentage = percentage+'%';
        $('#updater #progess #percent').width(percentage);
    };
    
    updateApplication = function () {
        var ba = new air.ByteArray();
        stream.readBytes(ba, 0, stream.bytesAvailable);
        updateFile = air.File.applicationStorageDirectory.resolvePath(applicationName);
        fileStream = new air.FileStream();
        fileStream.addEventListener( air.Event.CLOSE, installUpdate );
        fileStream.openAsync(updateFile, air.FileMode.WRITE);
        fileStream.writeBytes(ba, 0, ba.length);
        fileStream.close();
    };
    
    var installUpdate = function () {
        var updater = new air.Updater();
        // Notice that the version name has to be present as a second parameter
        updater.update(updateFile, latestVersion.toString());
    };
    
    return {
        init : function () {
            getApplicationVersion();
            getLatestVersion();
        }
    };
}();
window.onload = AIRUpdater.init;