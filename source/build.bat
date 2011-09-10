@echo off
set /p version= SPPMail Version? 
set files=default.html AIRAliases.js AIRUpdater.js global.css mixpanel.js global.js jquery.min.js notification_msg.html audio fonts icons images
@echo Building SPPMail-%version%.air...
adt -package -storetype pkcs12 -keystore ../sppmail.p12 ../build/SPPMail-%version%.air application.xml %files%