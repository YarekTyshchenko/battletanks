var io = require('socket.io').listen(9000);
io.set('log level', 2);

var microtime = require('microtime');

// Import external files
var fs = require('fs');
var vm = require('vm');
var includeInThisContext = function(path) {
    var code = fs.readFileSync(path);
    vm.runInThisContext(code, path);
}.bind(this);
includeInThisContext('../webroot/js/gameobject.js');
includeInThisContext('../webroot/js/tank.js');
includeInThisContext('../webroot/js/shell.js');

var _vectorConvert = function(direction) {
    switch(direction) {
        case 'up':
            return {x:0, y:-1};
        case 'down':
            return {x:0, y:1};
        case 'left':
            return {x:-1, y:0};
        case 'right':
            return {x:1, y:0};
    }
}

var controllers = {};
var ownerTanks = {};
var objects = {};
io.sockets.on('connection', function (socket) {
    // Send everyone's position to bootstrap client
    socket.on('load', function() {
        console.log('Client connected, send map to them');
        socket.emit('load', {objects: objects});
        //console.log(objects);
    });

    socket.on('join-control', function(data){
        // associate controller with tank
        controllers[socket.id] = data.controller_id;

        // Spawn tank on battlefield
        var tank = Object.create(Tank);
        tank.getId();
        tank.owner = data.controller_id;
        ownerTanks[data.controller_id] = tank.id;
        tank.x = 10;
        tank.y = 10;

        objects[tank.id] = tank;

        // Send update event to everyone
        socket.broadcast.emit('createTank', {
            object: tank
        });
    });

    // Main event distribution event =D
    socket.on('tank', function(data) {
        socket.broadcast.event('tank', data);
    });

    var time = null;
    var _controlTank = function(tank, data) {
        if (data.state == 'stop') {
            // @TODO: Move this code into setTimeout
            // Save tank's x and y after move is done
            var delta = (microtime.now() - time)/1000;
            tank.updatePosition(delta);

            // Stop tank
            tank.vector = {x:0, y:0};
        } else {
            time = microtime.now();
            tank.vector = _vectorConvert(data.action);
            tank.orientation = tank.vector;
        }
        socket.broadcast.emit('moveTank', {
            object: tank
        });
    }

    var _hitscanFrom = function(tank) {
        // Hitscan to other tanks

        _createShell(tank);
    }

    var _getCannonHardpoint = function(tank) {
        var o = tank.orientation;
        var point = {x:0, y:0};
        switch (true) {
            // right
            case (o.x == 1):
                point.x +=35;
                point.y +=18;
                break;
            // down
            case (o.y == 1):
                point.x += 18;
                point.y += 35;
                break;
            // left
            case (o.x == -1):
                point.x +=10;
                point.y +=18;
                break;
            // up
            case (o.y == -1):
                point.x += 18;
                point.y += 10;
                break;
        }

        return {
            x: tank.x + point.x,
            y: tank.y + point.y,
        };
    }

    var _createShell = function(tank) {
        var shell = Object.create(Shell);
        shell.getId();
        shell.owner = tank.owner;
        var chp = _getCannonHardpoint(tank);
        shell.x = chp.x;
        shell.y = chp.y;
        shell.vector = tank.orientation;
        //objects[shell.id] = shell;
        socket.broadcast.emit('createShell', {object:shell});
    }

    // Listen for controller
    socket.on('control', function(data) {
        if (!controllers[socket.id]) {
            return;
        }
        var tank = objects[ownerTanks[controllers[socket.id]]];
        console.log(
            tank.owner +"'s tank "+data.state+" "+data.type+" "+ data.action
        );
        switch(data.type) {
            case 'move':
                return _controlTank(tank, data);
            case 'shoot':
                switch (data.action) {
                    case 'bullet':
                        return _hitscanFrom(tank);
                    case 'mine':
                        return;
                }
        }
    });
});