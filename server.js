const http = require('http');
const url = require('url');
const os = require('os');
const zlib = require('zlib');
const childProcess = require('child_process');
  
const tools = {
    getip:function(){
        var address,ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            // ... and find the one that matches the criteria
            var iface = ifaces[dev].filter(function(details) {
                return details.family === 'IPv4' && details.internal === false;
            });
            if(iface.length > 0) address = iface[0].address
        }
        return address.replace(/"/g,"");
    },
    update:function(){
        console.log("start")
        http.get('http://ola.unaux.com/apps/milamu/src/upconf.json', (resp) => {
        var data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            console.log(data);
        });

        }).on("error", (err) => {
        console.log("Error: " + err.message);
        });
    }
}

function sql(config,callback){
    var params=["--xml"];

    for(var key in config){
        var param = '--'+key+'='+config[key];
        params.push(param);
    }

    childProcess.execFile('mysql/bin/mysql.exe',params,{maxBuffer: 1024 * 1024 * 1024},function(err,data) {  
        callback(err,data);
    });
}

//run mysql server
childProcess.execFile('mysql/bin/mysqld.exe',[], function(err, data) {  
    console.dir(err) ;
}); 
;



const requestListener = function (req,res) {

    if(req.method === 'POST'){
        var requestBody = [];
        req.on('data', (chunks)=>{requestBody.push(chunks);});
        req.on('end', ()=>{
           var parsedData = Buffer.concat(requestBody).toString();
           parsedData=JSON.parse(parsedData);
           var userIp=req.connection.remoteAddress;
           var imBkAddress='mysql/bk/'+userIp+'-imbk.sql';
           var exBkAddress='mysql/bk/'+userIp+'-exbk.sql';

           if(parsedData.sqlfile!=undefined){
                fs.writeFile(imBkAddress, parsedData.sqlfile, function (err) {
                    if (err) return console.log(err);
                    var impparam=' --host='+parsedData.host+' --port='+parsedData.port+' --user='+parsedData.user+' --password='+parsedData.password+' "'+parsedData.database+'" < '+imBkAddress;
                    childProcess.exec('"mysql/bin/mysql.exe"'+impparam,function(err,data) {  
                        if(err){console.log(err)};
                        if(err !== null ){
                            res.writeHead(200, { 'err': "sql" });
                            res.end(err.message);
                        }else{
                            res.setHeader('err', 0);
                            res.end(data);
                        }
                        fs.unlink(imBkAddress,function(err){
                            if(err){console.log(err)};
                        });
                    });
                });
               return;
           }
           if(parsedData.takebk!=undefined){
                console.log("taking backup from ip:"+userIp+" / user:"+parsedData.user);
                var table="";
                if(parsedData.table!=undefined){table='"'+parsedData.table+'"'}
                var expparam=' --host='+parsedData.host+' --port='+parsedData.port+' --user='+parsedData.user+' --password='+parsedData.password+' "'+parsedData.database+'" '+table+' > '+exBkAddress;
                childProcess.exec('"mysql/bin/mysqldump.exe"'+expparam,function(err,data) {  
                    
                    if(err !== null ){
                        res.writeHead(200, { 'err': "sql" });
                        res.end(err.message);
                    }else{
                       
                        res.setHeader('err', 0);
                        var readStream = fs.createReadStream(exBkAddress);
                        readStream.on('open', function () {
                            // This just pipes the read stream to the response object (which goes to the client)
                            res.writeHead(200, { 'Content-Encoding': 'gzip','Cache-Control':'no-store' });
                            readStream.pipe(zlib.createGzip({level : 7})).pipe(res);

                            fs.unlink(exBkAddress,function(err){
                                if(err){console.log(err)};
                            });
                        });
                        
                    }
                });
            return;
           }
           if(parsedData.updatereq!=undefined){
                tools.update();
                return;
           }
           sql(parsedData,function(err,data){
                res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store');
                if(err !== null ){
                    res.writeHead(200, { 'err': "sql" });
                    res.end(err.message);
                }else{
                    
                    
                    res.writeHead(200, { 
                        'err': "0",
                        'Content-Length': Buffer.byteLength(data),
                        'Transfer-Encoding':'chunked',
                        'Content-Encoding': 'gzip',
                        //'Content-Type':'application/xml',
                        //'Server': 'node/10.x (Win32)'
                    });
                    
                    zlib.gzip(data,{level : 7}, function(err,datagzip){
                        res.end(datagzip);
                    });
                    
                }
            });

        });
    }

    if(req.method === 'GET'){

        //content-type
        var requrlobj = url.parse(req.url,true);
        
        res.setHeader('content-type', req.headers.accept.split(",")[0]);

        if(requrlobj.pathname=="/"){requrlobj.pathname="index.html"}

        var readStream = fs.createReadStream("www/"+requrlobj.pathname);
        res.writeHead(200, {
            'Content-Encoding': 'gzip',
            'Cache-Control': 'private, max-age=900',
            'Accept-Ranges': 'bytes'
        });

        readStream.pipe(zlib.createGzip({level : 7})).pipe(res);

         // This catches any errors that happen while creating the readable stream (usually invalid names)
        readStream.on('error', function(err) {
            var errmsg="";
            console.log(err)
            switch(err.code){
                case'ENOENT':
                    res.statusCode = 404; // Tell the client that the resource wasn't found.
                break;
                default:
                    res.statusCode = 500; // Internal Server Error.
                    errmsg=err.code;
                break;
            }
            
            res.end(errmsg);
        });
    }


    
   


};


const serverPort = 747;
const serverHost = tools.getip();
const server = http.createServer(requestListener);
server.listen(serverPort, serverHost, () => {
    console.log(`Server is running on http://${serverHost}:${serverPort}`);
});




switch(process.platform){
    case"win32":
        childProcess.exec('start http://'+serverHost+':'+serverPort);
    break;
    case"darwin":
        childProcess.exec('open http://'+serverHost+':'+serverPort);
    break;
    case"linux":
        childProcess.exec('xdg-open http://'+serverHost+':'+serverPort);
    break;
}
